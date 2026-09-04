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
  "handsome anime young man with black wavy hair, black ornate coat with gold chains",
  "anime Naruto-style blonde spiky hair young man, orange and black outfit",
  "anime Goku-style spiky black hair young man, martial arts gi",
  "anime girl with long silver hair, elegant dark dress with gold jewelry",
  "anime girl with pink twin tails, stylish streetwear",
  "anime boy with white hair, modern black jacket",
  "anime girl with blue hair",
  "anime boy with green spiked hair",
];

function pickAnime() {
  return ANIME[Math.floor(Math.random() * ANIME.length)];
}

/** Prompt bắt AI vẽ đúng chữ trong ảnh — không overlay */
function buildPrompt(opts: {
  songTitle: string;
  artist: string;
  part: string;
  durationLabel: string;
  character: string;
}) {
  const { songTitle, artist, part, durationLabel, character } = opts;
  return [
    "Ultra detailed cinematic anime music promo poster, sharp 4K,",
    `LEFT side: ${character}, looking back over shoulder, one hand holding a floating black smartphone-sized music player card,`,
    "dramatic black background with golden particle energy spirals and stars,",
    `top-left must show clearly readable glowing gold text exactly: Nhac Hay VL and large badge ${part},`,
    "RIGHT side: floating black rounded TikTok Music style player card,",
    "card must show ONTOP MEDIA MUSIC logo,",
    "inside card: photorealistic album photo of a young Asian woman with light brown hair in a pink dress, clear face,",
    `card must display sharp perfectly readable white capital letters song title exactly: ${songTitle},`,
    `card must display sharp readable subtitle exactly: ${artist},`,
    `card progress bar labeled 0:00 and ${durationLabel},`,
    "all text must be crisp, legible, correctly spelled English/Vietnamese letters, no gibberish, no blurry text, no watermark",
  ].join(" ");
}

async function cfGenerate(prompt: string) {
  if (!CF_ACCOUNT || !CF_TOKEN) {
    throw new Error("Thiếu CF_ACCOUNT_ID hoặc CF_API_TOKEN");
  }

  const models = [
    {
      id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      body: {
        prompt,
        negative_prompt:
          "blurry text, unreadable text, gibberish text, misspelled text, lowres, watermark, deformed hands, extra fingers, ugly, cropped, bad anatomy",
        num_steps: 20,
        guidance: 9,
        width: 1024,
        height: 1024,
      },
    },
    {
      id: "@cf/bytedance/stable-diffusion-xl-lightning",
      body: {
        prompt,
        negative_prompt: "blurry text, unreadable text, gibberish, lowres, watermark",
        num_steps: 4,
        width: 1024,
        height: 1024,
      },
    },
  ];

  let last = "";
  for (const m of models) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${m.id}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(m.body),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok && buf.length > 20000) {
      return { buf, model: m.id, mime: "image/png" as const };
    }
    last = buf.toString("utf8").slice(0, 300);
  }
  throw new Error(last || "Cloudflare AI failed");
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const durationLabel = formatDuration(durationSec);
    const character = pickAnime();

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
    });

    const { buf, model, mime } = await cfGenerate(prompt);

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
      { error: e?.message || "AI generate failed" },
      { status: 500 }
    );
  }
}
