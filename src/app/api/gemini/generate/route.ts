import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CF_API_TOKEN || "";

/** Models đã test OK trên account này */
export const CF_MODELS = {
  "phoenix-1.0": {
    id: "@cf/leonardo/phoenix-1.0",
    label: "Leonardo Phoenix 1.0",
    kind: "binary" as const, // raw image bytes
  },
  "flux-1-schnell": {
    id: "@cf/black-forest-labs/flux-1-schnell",
    label: "Flux 1 Schnell",
    kind: "json-b64" as const, // { result: { image: base64 } }
  },
  "sdxl": {
    id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    label: "Stable Diffusion XL",
    kind: "binary" as const,
  },
  "sdxl-lightning": {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    label: "SDXL Lightning",
    kind: "binary" as const,
  },
};

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
    "Ultra detailed cinematic anime music promo poster, sharp 4K,",
    `LEFT: ${character}, looking back over shoulder, hand holding floating black smartphone music card,`,
    "dramatic black background with golden particle energy spirals,",
    `top-left glowing gold text Nhac Hay VL and large badge ${part},`,
    "RIGHT: floating black rounded TikTok Music player card, ONTOP MEDIA MUSIC logo,",
    "album photo young Asian woman light brown hair pink dress clear face,",
    `sharp readable white text song title exactly: ${songTitle},`,
    `subtitle exactly: ${artist}, progress 0:00 to ${durationLabel},`,
    "crisp legible letters, no gibberish text, no watermark",
  ].join(" ");
}

async function runModel(modelKey: string, prompt: string) {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error("Thiếu CF_ACCOUNT_ID / CF_API_TOKEN");

  const meta = CF_MODELS[modelKey as keyof typeof CF_MODELS];
  if (!meta) throw new Error("Model không hỗ trợ: " + modelKey);

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${meta.id}`;

  let body: Record<string, unknown> = { prompt };
  if (modelKey === "phoenix-1.0") {
    body = { prompt, width: 1024, height: 1024 };
  } else if (modelKey === "sdxl") {
    body = {
      prompt,
      negative_prompt: "blurry text, unreadable text, gibberish, lowres, watermark, deformed",
      num_steps: 20,
      guidance: 9,
      width: 1024,
      height: 1024,
    };
  } else if (modelKey === "sdxl-lightning") {
    body = {
      prompt,
      negative_prompt: "blurry text, gibberish, lowres, watermark",
      num_steps: 4,
      width: 1024,
      height: 1024,
    };
  } else if (modelKey === "flux-1-schnell") {
    body = { prompt }; // only prompt allowed
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const ct = res.headers.get("content-type") || "";
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  if (!res.ok) {
    throw new Error(buf.toString("utf8").slice(0, 300) || `HTTP ${res.status}`);
  }

  if (meta.kind === "json-b64" || ct.includes("application/json")) {
    const data = JSON.parse(buf.toString("utf8"));
    const b64 =
      data?.result?.image ||
      data?.image ||
      data?.result?.images?.[0] ||
      null;
    if (!b64) throw new Error("JSON không có image base64");
    const img = Buffer.from(b64, "base64");
    if (img.length < 5000) throw new Error("Ảnh quá nhỏ");
    return { buf: img, model: meta.id, mime: "image/jpeg" as const, label: meta.label };
  }

  if (buf.length < 10000) throw new Error("Ảnh quá nhỏ / lỗi model");
  const mime = ct.includes("jpeg") ? "image/jpeg" : "image/png";
  return { buf, model: meta.id, mime: mime as "image/jpeg" | "image/png", label: meta.label };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const durationLabel = formatDuration(durationSec);
    const modelKey = String(form.get("model") || "phoenix-1.0");
    const character = pickAnime();

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
    });

    // Thử model chọn, fallback lần lượt
    const order = [
      modelKey,
      "phoenix-1.0",
      "flux-1-schnell",
      "sdxl",
      "sdxl-lightning",
    ].filter((v, i, a) => a.indexOf(v) === i);

    let lastErr = "";
    for (const key of order) {
      try {
        const out = await runModel(key, prompt);
        return NextResponse.json({
          success: true,
          imageBase64: out.buf.toString("base64"),
          mimeType: out.mime,
          character,
          partLabel: part,
          durationLabel,
          songTitle,
          artist,
          provider: "cloudflare",
          model: out.model,
          modelKey: key,
          modelLabel: out.label,
        });
      } catch (e: any) {
        lastErr = e?.message || String(e);
        console.error("model fail", key, lastErr);
      }
    }
    throw new Error(lastErr || "Tất cả model thất bại");
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AI generate failed" },
      { status: 500 }
    );
  }
}
