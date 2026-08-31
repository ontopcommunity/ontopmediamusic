import { NextRequest, NextResponse } from "next/server";

const API = "https://api.json2video.com/v2";

function esc(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

    // Lower-third HTML tĩnh — bar + title + artist góc dưới-trái (giống ảnh mẫu)
    const lowerHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{
    width:100%;height:100%;
    background:transparent!important;
    overflow:hidden;
  }
  body{
    display:flex;
    align-items:flex-end;
    justify-content:flex-start;
    padding:0 0 48px 48px;
  }
  .row{
    display:flex;
    flex-direction:row;
    align-items:stretch;
    gap:14px;
    max-width:92%;
  }
  .bar{
    width:3px;
    min-width:3px;
    background:#fff;
    border-radius:1px;
    align-self:stretch;
    min-height:52px;
  }
  .col{
    display:flex;
    flex-direction:column;
    justify-content:center;
    gap:5px;
    min-width:0;
  }
  .title{
    font-family:Montserrat,Arial,Helvetica,sans-serif;
    font-weight:700;
    font-size:26px;
    line-height:1.15;
    color:#fff;
    text-shadow:0 2px 10px rgba(0,0,0,.7);
    text-transform:uppercase;
    letter-spacing:.02em;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .artist{
    font-family:Montserrat,Arial,Helvetica,sans-serif;
    font-weight:500;
    font-size:14px;
    line-height:1.2;
    color:rgba(255,255,255,.95);
    text-shadow:0 1px 6px rgba(0,0,0,.55);
    text-transform:uppercase;
    letter-spacing:.14em;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
</style></head><body>
  <div class="row">
    <div class="bar"></div>
    <div class="col">
      <div class="title">${esc(titleText)}</div>
      <div class="artist">${esc(artistText)}</div>
    </div>
  </div>
</body></html>`;

    const movie = {
      comment: "Ontop — lower third bottom-left like reference",
      resolution: "hd", // 1280x720
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
        // Logo góc trên-trái
        {
          type: "image",
          src: logo,
          x: 36,
          y: 24,
          width: 150,
          duration: -2,
          cache: true,
        },
        // Cụm thanh dọc + tên + tác giả — full width bottom area, content left-aligned
        {
          type: "html",
          html: lowerHtml,
          x: 0,
          y: 520,
          width: 1280,
          height: 200,
          duration: -2,
          cache: false,
          wait: 0.5,
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
