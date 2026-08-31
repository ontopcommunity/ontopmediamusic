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

    /**
     * Layout khớp ảnh mẫu:
     * - Video nền cover full khung (không viền đen)
     * - Góc dưới-trái: thanh dọc trắng mỏng + tên bài (đậm) + tác giả
     * - Logo góc trên-trái nhỏ
     * HD 1280x720, 50fps
     */
    const movie = {
      comment: "Ontop Media Music — reference lower-third layout",
      resolution: "hd",
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
        // Logo trên-trái (nhẹ, không che cảnh)
        {
          type: "image",
          src: logo,
          position: "top-left",
          x: 36,
          y: 28,
          width: 160,
          duration: -2,
          cache: true,
        },
        // Thanh dọc trắng — trước cụm text
        {
          type: "html",
          html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
.bar{width:3px;height:54px;background:#ffffff;border-radius:1px}
</style></head><body><div class="bar"></div></body></html>`,
          width: 6,
          height: 60,
          position: "bottom-left",
          x: 48,
          y: -56,
          duration: -2,
          cache: true,
          wait: 0,
        },
        // Tên bài
        {
          type: "text",
          text: titleText,
          start: 0,
          duration: -2,
          position: "bottom-left",
          x: 66,
          y: -78,
          settings: {
            "font-family": "Montserrat",
            "font-weight": "700",
            "font-size": "24px",
            color: "#FFFFFF",
            "text-shadow": "0 2px 8px rgba(0,0,0,0.65)",
            "letter-spacing": "0.02em",
            "text-align": "left",
            "vertical-align": "bottom",
          },
        },
        // Tác giả
        {
          type: "text",
          text: artistText || " ",
          start: 0,
          duration: -2,
          position: "bottom-left",
          x: 66,
          y: -50,
          settings: {
            "font-family": "Montserrat",
            "font-weight": "500",
            "font-size": "14px",
            color: "rgba(255,255,255,0.95)",
            "text-shadow": "0 1px 6px rgba(0,0,0,0.55)",
            "letter-spacing": "0.12em",
            "text-align": "left",
            "vertical-align": "bottom",
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
