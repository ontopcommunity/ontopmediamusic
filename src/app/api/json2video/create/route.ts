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
      .slice(0, 80);
    const artistText = String(artist || "").toUpperCase().slice(0, 50);

    // Thanh dọc trắng — HTML tối giản, sát góc dưới-trái
    const barHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:transparent}
.bar{width:4px;height:72px;background:#fff;border-radius:1px;
box-shadow:0 0 8px rgba(0,0,0,.5)}
</style></head><body><div class="bar"></div></body></html>`;

    const movie = {
      comment: "Ontop layout v3 native text bottom-left large",
      resolution: "hd",
      width: 1280,
      height: 720,
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
        // Logo góc trên-trái — phóng to
        {
          type: "image",
          src: logo,
          x: 28,
          y: 20,
          width: 200,
          duration: -2,
          cache: false,
        },
        // Thanh dọc sát góc dưới-trái
        {
          type: "html",
          html: barHtml,
          x: 36,
          y: 620,
          width: 12,
          height: 80,
          duration: -2,
          cache: false,
          wait: 0.2,
        },
        // Tên bài — to, sát đáy
        {
          type: "text",
          text: titleText,
          position: "bottom-left",
          x: 56,
          y: -56,
          duration: -2,
          settings: {
            "font-family": "Montserrat",
            "font-weight": "700",
            "font-size": "34px",
            color: "#ffffff",
            "text-shadow": "0 2px 12px rgba(0,0,0,0.75)",
            "text-transform": "uppercase",
            "letter-spacing": "0.02em",
            "text-align": "left",
          },
        },
        // Tác giả — dưới tên một chút
        {
          type: "text",
          text: artistText || " ",
          position: "bottom-left",
          x: 56,
          y: -28,
          duration: -2,
          settings: {
            "font-family": "Montserrat",
            "font-weight": "500",
            "font-size": "18px",
            color: "rgba(255,255,255,0.92)",
            "text-shadow": "0 1px 8px rgba(0,0,0,0.65)",
            "text-transform": "uppercase",
            "letter-spacing": "0.12em",
            "text-align": "left",
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
              x: 0,
              y: 0,
              width: 1280,
              height: 720,
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
