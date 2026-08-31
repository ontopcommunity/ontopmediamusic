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

    const logo =
      logoUrl ||
      `${req.nextUrl.origin}/logo.png`;

    // Movie JSON — layout giống yêu cầu: nền video mute, nhạc gốc, logo TL, chữ BL
    const movie = {
      comment: "Ontop Media Music",
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
        {
          type: "image",
          src: logo,
          x: 40,
          y: 28,
          width: 220,
          duration: -2,
          cache: true,
        },
        {
          type: "text",
          text: String(songTitle || "UNTITLED").toUpperCase().slice(0, 90),
          duration: -2,
          settings: {
            "font-family": "Be Vietnam Pro",
            "font-weight": "300",
            "font-size": "28px",
            color: "#ffffff",
            "text-shadow": "0 2px 8px rgba(0,0,0,0.65)",
            "text-transform": "uppercase",
            "letter-spacing": "0.02em",
            "vertical-position": "bottom",
            "horizontal-position": "left",
            padding: "0 0 72px 56px",
          },
        },
        {
          type: "text",
          text: String(artist || "").toUpperCase().slice(0, 60),
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
            padding: "0 0 48px 56px",
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
