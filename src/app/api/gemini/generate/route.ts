import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Free image API via Pollinations (no key). Target ≥6 images/day is fine. */

const ANIME_CHARS = [
  "Son Goku from Dragon Ball with spiky black hair",
  "Naruto Uzumaki with blonde spiky hair",
  "Sasuke Uchiha with dark hair",
  "Monkey D. Luffy with black hair and straw hat vibe",
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
}) {
  const { songTitle, artist, part, durationLabel, character } = opts;
  return [
    "Cinematic vertical-ish promo artwork, ultra detailed 4K,",
    "LEFT: anime character " + character + ", same pose as holding a floating phone card in open palm, looking back over shoulder,",
    "dramatic black and gold particle energy background, glowing sparks,",
    "top-left neon text 'Nhạc Hay VL' and large glowing part badge '" + part + "',",
    "RIGHT: floating black TikTok Music style player card with rounded corners,",
    "card header ONTOP MEDIA MUSIC and TikTok Music logo,",
    "large square album photo of a young Asian woman in soft pink dress (from reference cover photo), photorealistic face,",
    "song title on card: '" + songTitle + "',",
    "subtitle: '" + artist + "',",
    "playback bar 0:00 to " + durationLabel + ",",
    "heart skip play buttons, waveform, high quality product shot, sharp readable text, no watermark",
  ].join(" ");
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
  if (buf.length < 2000) {
    throw new Error("Pollinations trả về dữ liệu quá nhỏ");
  }
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
    const coverUrl = String(form.get("coverUrl") || "");
    const characterOverride = String(form.get("character") || "");
    const character = characterOverride.trim() || pickCharacter();

    const origin = req.nextUrl.origin;
    // Prefer public cover URL; if upload, we still describe in prompt
    let refUrl = coverUrl.startsWith("http")
      ? coverUrl.trim()
      : `${origin}/template-music-card.png`;

    // If user uploaded cover, we can't pass binary to Pollinations easily without hosting;
    // use template as style ref + strong prompt for cover description.
    if (coverFile && coverFile.size > 0 && !coverUrl) {
      refUrl = `${origin}/template-music-card.png`;
    }

    const prompt = buildPrompt({
      songTitle,
      artist,
      part,
      durationLabel,
      character,
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
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generate failed" },
      { status: 500 }
    );
  }
}
