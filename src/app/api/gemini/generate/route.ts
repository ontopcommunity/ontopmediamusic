import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CF_API_TOKEN || "";
const MODEL = "@cf/runwayml/stable-diffusion-v1-5-inpainting";

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Tạo PNG mask 512x512: trắng = vùng sửa (album + chữ + P1) */
async function buildMaskPng(): Promise<Buffer> {
  // Dùng SVG → raster qua Cloudflare không có; tạo PNG thô tối giản bằng raw IHDR không đủ.
  // Serverless: fetch mask tĩnh từ public nếu có, hoặc tạo bằng pure bytes.
  // Ưu tiên file public/mask-inpaint.png; fallback vẽ bằng response từ sharp-free path.
  const originMask = await fetch(
    `${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://ontopmediamusic.vercel.app"}/mask-inpaint.png`
  ).catch(() => null);

  // Tạo mask bằng canvas-like approach: encode minimal PNG with pure JS is hard.
  // Embed precomputed mask as base64 constant (512x512, white rects).
  // Generated offline: white on album + text + part badge.
  const fixed = process.env.INPAINT_MASK_B64;
  if (fixed) return Buffer.from(fixed, "base64");

  // Fallback: try public path relative
  try {
    const fs = await import("fs");
    const path = await import("path");
    const p = path.join(process.cwd(), "public", "mask-inpaint.png");
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch {}

  if (originMask && originMask.ok) {
    return Buffer.from(await originMask.arrayBuffer());
  }

  throw new Error("Thiếu mask-inpaint.png trong public/");
}

async function loadTemplatePng(origin: string): Promise<Buffer> {
  const res = await fetch(`${origin}/template-music-card.png`);
  if (!res.ok) throw new Error("Không tải được ảnh mẫu");
  // Resize to 512 on the fly if sharp available; else send original (API accepts and may resize)
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buf).resize(512, 512, { fit: "fill" }).png().toBuffer();
  } catch {
    return buf;
  }
}

function buildPrompt(songTitle: string, artist: string, part: string, durationLabel: string) {
  return [
    "Keep the exact same overall image composition outside the masked area.",
    "In the masked album area: photorealistic young Asian woman, light brown hair, soft pink dress, clear face,",
    `below the photo white UI text song title "${songTitle}" and artist "${artist}",`,
    `duration 0:00 to ${durationLabel}, part badge ${part},`,
    "sharp readable text, high detail, match TikTok music card style",
  ].join(" ");
}

export async function POST(req: NextRequest) {
  try {
    if (!CF_ACCOUNT || !CF_TOKEN) {
      return NextResponse.json(
        { error: "Thiếu CF_ACCOUNT_ID / CF_API_TOKEN" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const durationLabel = formatDuration(durationSec);
    const coverFile = form.get("cover") as File | null;
    const coverUrl = String(form.get("coverUrl") || "").trim();

    const origin = req.nextUrl.origin;
    let imageBuf = await loadTemplatePng(origin);

    // Nếu có cover: dán cover vào vùng album trước khi inpaint (giữ layout + đưa mặt người vào)
    if ((coverFile && coverFile.size > 0) || coverUrl.startsWith("http")) {
      try {
        const sharp = (await import("sharp")).default;
        let coverBuf: Buffer;
        if (coverFile && coverFile.size > 0) {
          coverBuf = Buffer.from(await coverFile.arrayBuffer());
        } else {
          const cr = await fetch(coverUrl);
          coverBuf = Buffer.from(await cr.arrayBuffer());
        }
        // scale coords 1330x1182 → 512x512
        const ax = Math.round((800 * 512) / 1330);
        const ay = Math.round((195 * 512) / 1182);
        const aw = Math.round((355 * 512) / 1330);
        const ah = Math.round((355 * 512) / 1182);
        const coverFitted = await sharp(coverBuf)
          .resize(aw, ah, { fit: "cover" })
          .png()
          .toBuffer();
        imageBuf = await sharp(imageBuf)
          .composite([{ input: coverFitted, left: ax, top: ay }])
          .png()
          .toBuffer();
      } catch {
        // không có sharp: bỏ qua pre-paste
      }
    }

    const maskBuf = await buildMaskPng();
    const prompt = buildPrompt(songTitle, artist, part, durationLabel);

    const body = {
      prompt,
      negative_prompt:
        "blurry, lowres, watermark, deformed, extra fingers, text gibberish, different layout",
      image: Array.from(new Uint8Array(imageBuf)),
      mask: Array.from(new Uint8Array(maskBuf)),
      num_steps: 20,
      strength: 0.9,
    };

    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const out = Buffer.from(await res.arrayBuffer());
    if (!res.ok || out.length < 10000) {
      const msg = out.toString("utf8").slice(0, 400);
      return NextResponse.json(
        { error: `Inpainting failed: ${msg || res.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageBase64: out.toString("base64"),
      mimeType: "image/png",
      character: "(giữ pose ảnh mẫu — inpainting)",
      partLabel: part,
      durationLabel,
      songTitle,
      artist,
      provider: "cloudflare",
      model: MODEL,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generate failed" },
      { status: 500 }
    );
  }
}
