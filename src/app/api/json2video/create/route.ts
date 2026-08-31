import { NextRequest, NextResponse } from "next/server";

const API = "https://api.json2video.com/v2";

export async function POST(req: NextRequest) {
  const key = process.env.JSON2VIDEO_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Thiếu JSON2VIDEO_API_KEY trên server. Thêm env trên Vercel rồi redeploy.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const {
      videoUrl,
      musicUrl,
      songTitle = "",
      artist = "",
      durationSec,
      logoUrl,
    } = body as {
      videoUrl?: string;
      musicUrl?: string;
      songTitle?: string;
      artist?: string;
      durationSec?: number;
      logoUrl?: string;
    };

    if (!videoUrl || !musicUrl) {
      return NextResponse.json(
        { error: "Cần videoUrl và musicUrl (URL công khai)." },
        { status: 400 }
      );
    }

    const dur =
      typeof durationSec === "number" && durationSec > 1
        ? Math.min(durationSec, 600)
        : 30;

    const logo = logoUrl || `${req.nextUrl.origin}/logo.png`;
    const titleText = String(songTitle || "UNTITLED")
      .toUpperCase()
      .slice(0, 90);
    const artistText = String(artist || "").toUpperCase().slice(0, 60);

    // Thanh dọc trắng trước cụm chữ (góc dưới-trái)
    const barHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
.bar{width:3px;height:64px;background:#ffffff;border-radius:1px;
box-shadow:0 0 6px rgba(0,0,0,.45)}
</style></head><body><div class="bar"></div></body></html>`;

    // Layout gốc commit d66f23b + thanh dọc + tên đậm hơn
    const movie = {
      comment: "Ontop Media Music — layout d66f23b + bar + bold title",
      resolution: "hd", // 1280x720
      fps: 50,
      quality: "high",
      cache: false,
      elements: [
        {
          type: "audio",
          src: musicUrl,
          duration: dur,
          volume: 1,
        },
        // Logo góc trên-trái (như commit đầu)
        {
          type: "image",
          src: logo,
          x: 40,
          y: 28,
          width: 220,
          duration: -2,
          cache: true,
        },
        // Thanh dọc — sát cụm chữ dưới-trái
        {
          type: "html",
          html: barHtml,
          x: 40,
          y: 620,
          width: 10,
          height: 70,
          duration: -2,
          cache: false,
          wait: 0.2,
        },
        // Tên bài — layout gốc, font đậm hơn (700)
        {
          type: "text",
          text: titleText,
          duration: -2,
          settings: {
            "font-family": "Be Vietnam Pro",
            "font-weight": "700",
            "font-size": "28px",
            color: "#ffffff",
            "text-shadow": "0 2px 8px rgba(0,0,0,0.65)",
            "text-transform": "uppercase",
            "letter-spacing": "0.02em",
            "vertical-position": "bottom",
            "horizontal-position": "left",
            padding: "0 0 58px 56px",
          },
        },
        // Tác giả — y chang commit đầu
        {
          type: "text",
          text: artistText,
          duration: -2,
          settings: {
            "font-family": "Inter",
            "font-weight": "500",
            "font-size": "18px",
            color: "rgba(255,255,255,0.92)",
            "text-shadow": "0 1px 6px rgba(0,0,0,0.55)",
            "text-transform": "uppercase",
            "letter-spacing": "0.08em",
            "vertical-position": "bottom",
            "horizontal-position": "left",
            padding: "0 0 34px 56px",
          },
        },
      ],
      scenes: [
        {
          duration: dur,
          elements: [
            {
              type: "video",
              src: videoUrl,
              muted: true,
              loop: -1,
              duration: -2,
              volume: 0,
              resize: "cover",
            },
          ],
        },
      ],
    };

    const res = await fetch(`${API}/movies`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(movie),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return NextResponse.json(
        {
          error:
            data.message ||
            data.error ||
            `JSON2Video lỗi HTTP ${res.status}`,
          detail: data,
        },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      project: data.project,
      timestamp: data.timestamp,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Create failed" },
      { status: 500 }
    );
  }
}
