import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const ANIME_CHARS = [
  "Son Goku from Dragon Ball with spiky black hair",
  "Naruto Uzumaki with blonde spiky hair",
  "Sasuke Uchiha with dark hair",
  "Monkey D. Luffy with black hair",
  "Ichigo Kurosaki with orange spiky hair",
  "Tanjiro Kamado with burgundy hair",
  "Gojo Satoru with white hair",
  "Levi Ackerman with undercut",
  "Mikasa Ackerman with short black hair",
  "Asuna with long chestnut hair",
  "Rem with blue hair",
  "Zero Two with pink hair and horns",
  "Nezuko with long black-pink hair",
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
  hasCoverRef: boolean;
}) {
  const { songTitle, artist, part, durationLabel, character, hasCoverRef } = opts;
  const coverLine = hasCoverRef
    ? "Inside the music card, use the exact face and appearance of the person from the REFERENCE IMAGE as the album cover photo (photorealistic, same person),"
    : "Inside the music card, album photo of a young woman, photorealistic,";
  return [
    "Cinematic promo artwork, ultra detailed 4K, match music promo card layout,",
    "LEFT: anime character " + character + ", pose holding a floating phone-sized card in open palm, looking back over shoulder,",
    "dramatic black and gold particle energy background, glowing sparks,",
    "top-left neon text 'Nhạc Hay VL' and large glowing part badge '" + part + "',",
    "RIGHT: floating black TikTok Music style player card with rounded corners,",
    "card header ONTOP MEDIA MUSIC and TikTok Music logo,",
    coverLine,
    "song title on card: '" + songTitle + "',",
    "subtitle: '" + artist + "',",
    "playback bar from 0:00 to " + durationLabel + ",",
    "play controls and waveform, sharp readable text, no watermark, no extra logos",
  ].join(" ");
}

/** Upload file to litterbox (1h public URL) so Pollinations can fetch it */
async function hostTempPublic(file: Blob, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
  fd.append("time", "1h");
  fd.append("fileToUpload", file, filename || "cover.jpg");
  const res = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    body: fd,
  });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith("http")) {
    // fallback tmpfiles.org
    const fd2 = new FormData();
    fd2.append("file", file, filename || "cover.jpg");
    const r2 = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: fd2,
    });
    const j = await r2.json().catch(() => ({}));
    const u = j?.data?.url as string | undefined;
    if (u) {
      // tmpfiles page URL -> direct
      return u.replace("tmpfiles.org/", "tmpfiles.org/dl/");
    }
    throw new Error("Không host được ảnh upload tạm: " + text.slice(0, 120));
  }
  return text;
}

async function pollinationsGenerate(prompt: string, refImageUrl?: string) {
  const params = new URLSearchParams({
    width: "1330",
    height: "1182",
    nologo: "true",
    model: "flux",
    enhance: "true",
    safe: "false",
    seed: String(Math.floor(Math.random() * 1e9)),
  });
  if (refImageUrl) params.set("image", refImageUrl);

  const url =
    "https://image.pollinations.ai/prompt/" +
    encodeURIComponent(prompt) +
    "?" +
    params.toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      Accept: "image/*",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Pollinations HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error("Pollinations trả về dữ liệu quá nhỏ");
  const ct = res.headers.get("content-type") || "image/jpeg";
  return { buf, mime: ct.split(";")[0] || "image/jpeg" };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const durationLabel = formatDuration(durationSec);
    const coverFile = form.get("cover") as File | null;
    const coverUrl = String(form.get("coverUrl") || "").trim();
    const characterOverride = String(form.get("character") || "");
    const character = characterOverride.trim() || pickCharacter();

    let refUrl: string | undefined;
    if (coverFile && coverFile.size > 0) {
      refUrl = await hostTempPublic(
        coverFile,
        coverFile.name || "cover.jpg"
      );
    } else if (coverUrl.startsWith("http")) {
      refUrl = coverUrl;
    } else {
      return NextResponse.json(
        { error: "Cần upload ảnh cover hoặc dán link ảnh" },
        { status: 400 }
      );
    }

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
      hasCoverRef: true,
    });

    const { buf, mime } = await pollinationsGenerate(prompt, refUrl);

    return NextResponse.json({
      success: true,
      imageBase64: buf.toString("base64"),
      mimeType: mime,
      character,
      partLabel: part,
      durationLabel,
      songTitle,
      artist,
      provider: "pollinations",
      model: "flux",
      refUrl,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generate failed" },
      { status: 500 }
    );
  }
}
