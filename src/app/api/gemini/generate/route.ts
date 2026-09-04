import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CF_API_TOKEN || "";
const CF_MODEL =
  process.env.CF_IMAGE_MODEL ||
  "@cf/stabilityai/stable-diffusion-xl-base-1.0";

const ANIME = [
  "handsome anime young man with black wavy hair, black ornate coat with gold chains",
  "anime Naruto-style blonde spiky hair young man, orange and black outfit",
  "anime Goku-style spiky black hair young man, martial arts gi",
  "anime girl with long silver hair, elegant dark dress with gold jewelry",
  "anime girl with pink twin tails, stylish streetwear",
  "anime boy with white hair, modern black jacket",
];

function pickAnime() {
  return ANIME[Math.floor(Math.random() * ANIME.length)];
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
  hasCoverHint: boolean;
}) {
  const { songTitle, artist, part, durationLabel, character, hasCoverHint } =
    opts;
  const cover = hasCoverHint
    ? "album cover photo of the exact person from the user reference (young Asian look), photorealistic face,"
    : "album cover photo of a young Asian woman with light brown hair in a soft pink dress,";
  return [
    "Cinematic anime music promo poster, ultra detailed 4K,",
    `LEFT: ${character}, looking back over shoulder, one hand extended holding a floating smartphone-sized black music player card,`,
    "dramatic black background with golden particle energy spirals and stars,",
    `top-left glowing gold text "Nhạc Hay VL" and large glowing part badge "${part}",`,
    "RIGHT: floating black rounded TikTok Music player card,",
    "ONTOP MEDIA MUSIC logo and TikTok Music logo on the card,",
    cover,
    `song title on card: "${songTitle}",`,
    `artist subtitle: "${artist}",`,
    `progress bar from 0:00 to ${durationLabel},`,
    "play controls, waveform, sharp readable text, no watermark",
  ].join(" ");
}

async function cfGenerate(prompt: string, negative: string) {
  if (!CF_ACCOUNT || !CF_TOKEN) {
    throw new Error("Thiếu CF_ACCOUNT_ID hoặc CF_API_TOKEN trên server");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_MODEL}`;

  // Prefer lightning if SDXL capacity exceeded
  const models = [
    CF_MODEL,
    "@cf/bytedance/stable-diffusion-xl-lightning",
    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  ];
  let lastErr = "";
  for (const model of models) {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${model}`;
    const isLightning = model.includes("lightning");
    const body = {
      prompt,
      negative_prompt: negative,
      num_steps: isLightning ? 4 : 16,
      guidance: isLightning ? 1 : 7.5,
      width: 1024,
      height: 1024,
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      lastErr = buf.toString("utf8").slice(0, 300);
      continue;
    }
    if (buf.length < 10000) {
      lastErr = "Cloudflare trả về ảnh quá nhỏ / capacity";
      continue;
    }
    return { buf, model, mime: "image/png" };
  }
  throw new Error(lastErr || "Cloudflare image failed");
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
    const character = pickAnime();
    const hasCover = !!(coverFile && coverFile.size > 0) || coverUrl.startsWith("http");

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
      hasCoverHint: hasCover,
    });
    const negative =
      "blurry, lowres, watermark, deformed hands, extra fingers, text gibberish, ugly, cropped, different layout";

    const { buf, model, mime } = await cfGenerate(prompt, negative);

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
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generate failed" },
      { status: 500 }
    );
  }
}
