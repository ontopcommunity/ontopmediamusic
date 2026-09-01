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
      seekSec,
      videoDurationSec,
    } = body as {
      videoUrl?: string;
      musicUrl?: string;
      songTitle?: string;
      artist?: string;
      durationSec?: number;
      logoUrl?: string;
      seekSec?: number;
      videoDurationSec?: number;
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

    /**
     * Một block HTML duy nhất:
     * - Thanh dọc cố định bên trái
     * - Cụm tên + tác giả căn giữa theo chiều dọc với thanh dọc (align-items: center)
     * - Đặt góc dưới-trái canvas 1280x720
     */
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
  padding:0 0 56px 56px;
}
.row{
  display:flex;
  flex-direction:row;
  align-items:center; /* tên + tác giả căn giữa với thanh dọc */
  gap:12px;
  max-width:90%;
}
.bar{
  width:3px;
  height:72px; /* cố định — không đổi */
  min-width:3px;
  background:#ffffff;
  border-radius:1px;
  flex-shrink:0;
  box-shadow:0 0 6px rgba(0,0,0,.4);
}
.col{
  display:flex;
  flex-direction:column;
  justify-content:center;
  gap:4px;
  min-width:0;
}
.title{
  font-family:"Be Vietnam Pro",Montserrat,Arial,sans-serif;
  font-weight:700;
  font-size:32px;
  line-height:1.2;
  color:#ffffff;
  text-shadow:0 2px 8px rgba(0,0,0,.7);
  text-transform:uppercase;
  letter-spacing:.02em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.artist{
  font-family:Inter,Montserrat,Arial,sans-serif;
  font-weight:500;
  font-size:18px;
  line-height:1.2;
  color:rgba(255,255,255,.92);
  text-shadow:0 1px 6px rgba(0,0,0,.55);
  text-transform:uppercase;
  letter-spacing:.12em;
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

    // Đoạn nền ngẫu nhiên: seek trong file gốc (không lấy từ đầu)
    let startAt = 0;
    if (typeof seekSec === "number" && seekSec >= 0) {
      startAt = seekSec;
    } else if (
      typeof videoDurationSec === "number" &&
      videoDurationSec > dur + 0.5
    ) {
      const maxStart = videoDurationSec - dur;
      startAt = Math.random() * maxStart;
    }
    startAt = Math.max(0, Math.floor(startAt * 100) / 100);
    // Nếu video nền ngắn hơn nhạc thì loop; còn lại chơi 1 đoạn seek..seek+dur
    const bgLoop =
      typeof videoDurationSec === "number" && videoDurationSec > 0 && videoDurationSec < dur
        ? -1
        : 1;

    const movie = {
      comment: "Ontop — bar fixed + title/artist vertically centered to bar",
      resolution: "full-hd",
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
          x: 48,
          y: 32,
          width: 260,
          duration: -2,
          cache: true,
        },
        {
          type: "html",
          html: lowerHtml,
          x: 0,
          y: 860,
          width: 1920,
          height: 220,
          duration: -2,
          cache: false,
          wait: 0.3,
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
              loop: bgLoop,
              duration: dur,
              volume: 0,
              resize: "cover",
              seek: startAt,
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
