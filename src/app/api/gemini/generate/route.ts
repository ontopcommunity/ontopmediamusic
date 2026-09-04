import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const GEMINI_MODEL = "gemini-3.1-flash-image";

const ANIME_CHARS = [
  "Son Goku (Dragon Ball) with spiky black hair",
  "Naruto Uzumaki with blonde spiky hair and orange accents",
  "Sasuke Uchiha with dark hair and serious expression",
  "Luffy (One Piece) with black hair and confident look",
  "Ichigo Kurosaki with orange spiky hair",
  "Tanjiro Kamado with burgundy hair and scar",
  "Gojo Satoru with white hair and blindfold style",
  "Levi Ackerman with undercut black hair",
  "Mikasa Ackerman with short black hair and scarf",
  "Asuna Yuuki with long chestnut hair",
  "Rem (Re:Zero) with blue hair and maid accents",
  "Zero Two with pink horns and long pink hair",
  "Nezuko Kamado with long black-to-pink hair",
  "Sailor Moon with blonde twin tails",
  "Inuyasha with long silver hair",
];

function pickCharacter() {
  return ANIME_CHARS[Math.floor(Math.random() * ANIME_CHARS.length)];
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function buildPrompt(opts: {
  songTitle: string;
  artist: string;
  part: string;
  durationLabel: string;
  character: string;
}) {
  const { songTitle, artist, part, durationLabel, character } = opts;
  return `You are an expert image editor. Edit IMAGE 1 (the template) using IMAGE 2 (the cover photo).

CRITICAL RULES — follow every point exactly:
1) Keep the EXACT same overall composition, canvas size, aspect ratio, and layout as IMAGE 1. Do NOT crop, stretch, or change dimensions.
2) LEFT SIDE character: Replace the anime character with ${character}. The POSE must match IMAGE 1 100% (body angle, hand extended holding the floating card, head turn, shoulder position). Change hairstyle, face, and outfit freely but keep the same pose and dramatic golden particle background energy.
3) Keep the glowing text on the upper-left similar style showing "${part}" and a short Vietnamese vibe title line such as "Nhạc Hay VL" if present — update the part badge to exactly "${part}".
4) RIGHT SIDE music card (TikTok Music style):
   - Keep the black rounded card, TikTok Music logo, ONTOP MEDIA MUSIC branding placement.
   - Replace the photo INSIDE the card with the person/face from IMAGE 2. Fit the photo naturally into that card frame (same position/size as the girl photo in the template).
   - Song title text on the card: "${songTitle}"
   - Subtitle / artist line: "${artist}"
   - Timeline duration on the progress bar: start 0:00 and end ${durationLabel}.
5) Ultra sharp 4K detail, cinematic lighting, crisp readable text, no blurry letters, no watermarks, no extra UI.
6) Output a single finished image only.`;
}

async function blobToBase64(file: Blob) {
  const buf = Buffer.from(await file.arrayBuffer());
  return buf.toString("base64");
}

async function urlToBase64(url: string) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Không tải được ảnh: ${url} (${r.status})`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await r.arrayBuffer());
  return { b64: buf.toString("base64"), mime: ct.split(";")[0] };
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Thiếu GEMINI_API_KEY trên server" },
      { status: 500 }
    );
  }

  try {
    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const durationLabel = formatDuration(durationSec);
    const coverFile = form.get("cover") as File | null;
    const coverUrl = String(form.get("coverUrl") || "");
    const characterOverride = String(form.get("character") || "");
    const character = characterOverride.trim() || pickCharacter();

    const origin = req.nextUrl.origin;
    const templateRes = await fetch(`${origin}/template-music-card.png`);
    if (!templateRes.ok) {
      return NextResponse.json(
        { error: "Không đọc được ảnh mẫu template-music-card.png" },
        { status: 500 }
      );
    }
    const templateB64 = Buffer.from(await templateRes.arrayBuffer()).toString(
      "base64"
    );

    let coverB64: string;
    let coverMime = "image/jpeg";
    if (coverFile && coverFile.size > 0) {
      coverB64 = await blobToBase64(coverFile);
      coverMime = coverFile.type || "image/jpeg";
    } else if (coverUrl.startsWith("http")) {
      const u = await urlToBase64(coverUrl);
      coverB64 = u.b64;
      coverMime = u.mime;
    } else {
      return NextResponse.json(
        { error: "Cần upload ảnh cover hoặc link ảnh" },
        { status: 400 }
      );
    }

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/png",
                data: templateB64,
              },
            },
            {
              inline_data: {
                mime_type: coverMime,
                data: coverB64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 0.4,
      },
    };

    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        lastErr = raw.slice(0, 400);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
          continue;
        }
        return NextResponse.json(
          { error: `Gemini HTTP ${res.status}`, detail: lastErr },
          { status: 502 }
        );
      }

      if (res.status === 429) {
        lastErr = data?.error?.message || "Rate limited";
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }

      if (!res.ok) {
        return NextResponse.json(
          {
            error: data?.error?.message || `Gemini lỗi ${res.status}`,
            detail: data,
          },
          { status: 502 }
        );
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        const inline = p.inlineData || p.inline_data;
        if (inline?.data) {
          return NextResponse.json({
            success: true,
            imageBase64: inline.data,
            mimeType: inline.mimeType || inline.mime_type || "image/png",
            character,
            partLabel: part,
            durationLabel,
            songTitle,
            artist,
          });
        }
      }

      lastErr =
        data?.candidates?.[0]?.finishReason ||
        JSON.stringify(data).slice(0, 500);
      await new Promise((r) => setTimeout(r, 2000));
    }

    return NextResponse.json(
      { error: "Gemini không trả về ảnh. Thử lại sau.", detail: lastErr },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generate failed" },
      { status: 500 }
    );
  }
}
