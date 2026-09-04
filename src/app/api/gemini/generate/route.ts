import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CF_API_TOKEN || "";

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const ANIME = [
  "handsome anime young man black wavy hair gold chain black coat",
  "anime Naruto blonde spiky hair orange black outfit",
  "anime Goku spiky black hair martial arts gi",
  "anime girl long silver hair elegant dark dress",
  "anime girl pink twin tails streetwear",
  "anime boy white hair modern black jacket",
  "anime girl blue hair maid style",
  "anime boy green spiked hair",
];

function pickAnime() {
  return ANIME[Math.floor(Math.random() * ANIME.length)];
}

function buildPrompt(opts: {
  songTitle: string;
  artist: string;
  part: string;
  durationLabel: string;
  character: string;
}) {
  const { songTitle, artist, part, durationLabel, character } = opts;
  return [
    "Cinematic anime music promo poster, ultra detailed sharp 4K,",
    `LEFT: ${character}, looking back over shoulder, hand holding floating black smartphone music card,`,
    "dramatic black background with golden particle energy spirals,",
    `top-left glowing gold text Nhac Hay VL and large badge ${part},`,
    "RIGHT: floating black rounded TikTok Music player card with ONTOP MEDIA MUSIC logo,",
    "album cover photo young Asian woman light brown hair pink dress clear face,",
    `sharp readable white text song title "${songTitle}",`,
    `subtitle "${artist}", progress bar 0:00 to ${durationLabel},`,
    "high quality UI, crisp letters, no watermark, no blurry text",
  ].join(" ");
}

async function cfTextToImage(prompt: string) {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error("Thiếu CF_ACCOUNT_ID / CF_API_TOKEN");

  const models = [
    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    "@cf/bytedance/stable-diffusion-xl-lightning",
  ];
  let last = "";
  for (const model of models) {
    const isLightning = model.includes("lightning");
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${model}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        negative_prompt:
          "blurry text, unreadable text, lowres, watermark, deformed hands, extra fingers, ugly, cropped",
        num_steps: isLightning ? 4 : 18,
        guidance: isLightning ? 1 : 8,
        width: 1024,
        height: 1024,
      }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok && buf.length > 20000) {
      return { buf, model, mime: "image/png" as const };
    }
    last = buf.toString("utf8").slice(0, 280);
  }
  throw new Error(last || "Cloudflare AI failed");
}

async function cfInpaint(templatePng: Buffer, maskPng: Buffer, prompt: string) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: "blurry, unreadable text, lowres, watermark, deformed",
      image: Array.from(new Uint8Array(templatePng)),
      mask: Array.from(new Uint8Array(maskPng)),
      num_steps: 20,
      strength: 0.85,
    }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.length < 10000) {
    throw new Error(buf.toString("utf8").slice(0, 280) || `inpaint ${res.status}`);
  }
  return buf;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const durationLabel = formatDuration(durationSec);
    const mode = String(form.get("mode") || "auto"); // auto | txt2img | inpaint
    const character = pickAnime();

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
    });

    // 1) Ưu tiên inpaint từ ảnh mẫu (giữ pose) — fallback txt2img SDXL
    if (mode !== "txt2img") {
      try {
        const origin = req.nextUrl.origin;
        const [tplRes, maskRes] = await Promise.all([
          fetch(`${origin}/template-music-card.png`),
          fetch(`${origin}/mask-inpaint.png`),
        ]);
        if (tplRes.ok && maskRes.ok) {
          let tplBuf = Buffer.from(await tplRes.arrayBuffer());
          const maskBuf = Buffer.from(await maskRes.arrayBuffer());
          // resize template 512 nếu có sharp
          try {
            const sharp = (await import("sharp")).default;
            tplBuf = await sharp(tplBuf).resize(512, 512, { fit: "fill" }).png().toBuffer();
          } catch {}
          const out = await cfInpaint(tplBuf, maskBuf, prompt);
          return NextResponse.json({
            success: true,
            imageBase64: out.toString("base64"),
            mimeType: "image/png",
            character,
            partLabel: part,
            durationLabel,
            songTitle,
            artist,
            provider: "cloudflare",
            model: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
            needTextOverlay: true, // client đè cover + chữ rõ
          });
        }
      } catch (e: any) {
        console.error("inpaint fail, fallback txt2img", e?.message);
      }
    }

    const { buf, model, mime } = await cfTextToImage(prompt);
    return NextResponse.json({
      success: true,
      imageBase64: buf.toString("base64"),
      mimeType: mime,
      character,
      partLabel: part,
      durationLabel,
      songTitle,
      artist,
      provider: "cloudflare",
      model,
      needTextOverlay: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AI generate failed" },
      { status: 500 }
    );
  }
}
