import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Resolve TikTok music / audio links to a usable audio URL */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Thiếu url" }, { status: 400 });
    }
    const u = url.trim();

    if (/\.(mp3|m4a|aac|wav|ogg)(\?|$)/i.test(u)) {
      return NextResponse.json({ success: true, audioUrl: u, type: "direct" });
    }

    const r = await fetch(u, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        Accept: "*/*",
      },
    });
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("audio") || ct.includes("mpeg") || ct.includes("mp4")) {
      return NextResponse.json({
        success: true,
        audioUrl: r.url || u,
        type: "redirect",
        contentType: ct,
      });
    }

    const text = await r.text();
    const mp3 =
      text.match(/https?:\/\/[^"'\\s]+\.mp3[^"'\\s]*/i)?.[0] ||
      text.match(/https?:\/\/[^"'\\s]*ies-music[^"'\\s]*/i)?.[0];
    if (mp3) {
      return NextResponse.json({
        success: true,
        audioUrl: mp3.replace(/&amp;/g, "&"),
        type: "scraped",
      });
    }

    return NextResponse.json({
      success: true,
      audioUrl: u,
      type: "passthrough",
      warning: "Không chắc là file audio trực tiếp. Nên upload mp3 nếu lỗi.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "resolve failed" },
      { status: 500 }
    );
  }
}
