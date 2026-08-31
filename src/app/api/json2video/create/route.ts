import { NextRequest, NextResponse } from "next/server";

const API = "https://api.json2video.com/v2";

function escapeHtml(s: string) {
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

    const logo =
      logoUrl || `${req.nextUrl.origin}/logo.png`;

    const titleText = String(songTitle || "UNTITLED")
      .toUpperCase()
      .slice(0, 90);
    const artistText = String(artist || "").toUpperCase().slice(0, 60);

    // Top-left: VIDEO BY ONTOP — gõ → giữ 2s → xóa nhanh → chờ 2s → lặp + con trỏ nhấp nháy
    const htmlTypeLoop = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:transparent;overflow:hidden}
  body{display:flex;align-items:flex-start;justify-content:flex-start;padding:36px 40px}
  .wrap{font-family:"Inter",system-ui,sans-serif;font-weight:600;font-size:22px;color:#fff;
    text-shadow:0 2px 10px rgba(0,0,0,.65);letter-spacing:.04em;white-space:nowrap}
  .cursor{display:inline-block;width:2px;height:1.05em;background:#fff;margin-left:3px;
    vertical-align:-2px;animation:blink .7s step-end infinite}
  @keyframes blink{50%{opacity:0}}
</style></head><body>
<div class="wrap"><span id="t"></span><span class="cursor"></span></div>
<script>
(function(){
  var full="VIDEO BY ONTOP";
  var el=document.getElementById("t");
  var i=0, deleting=false;
  function tick(){
    if(!deleting){
      i++;
      el.textContent=full.slice(0,i);
      if(i>=full.length){ setTimeout(function(){ deleting=true; tick(); }, 2000); return; }
      setTimeout(tick, 90);
    } else {
      i--;
      el.textContent=full.slice(0,Math.max(0,i));
      if(i<=0){ deleting=false; setTimeout(tick, 2000); return; }
      setTimeout(tick, 35);
    }
  }
  tick();
})();
</script></body></html>`;

    // Bottom-left: thanh dọc + tên (đậm) + tác giả — gõ 1 lần (không xóa)
    const htmlLower = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:transparent;overflow:hidden}
  body{display:flex;align-items:flex-end;justify-content:flex-start;padding:0 0 48px 48px}
  .row{display:flex;align-items:stretch;gap:14px;max-width:90%}
  .bar{width:3px;background:#fff;flex-shrink:0;border-radius:1px;
    box-shadow:0 0 8px rgba(0,0,0,.4)}
  .col{display:flex;flex-direction:column;justify-content:center;gap:6px;min-width:0}
  .title{font-family:"Be Vietnam Pro","Inter",sans-serif;font-weight:700;font-size:28px;
    color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.65);text-transform:uppercase;
    letter-spacing:.02em;line-height:1.15;white-space:nowrap;overflow:hidden}
  .artist{font-family:"Inter",sans-serif;font-weight:500;font-size:16px;
    color:rgba(255,255,255,.92);text-shadow:0 1px 6px rgba(0,0,0,.55);
    text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;overflow:hidden}
  .cursor{display:inline-block;width:2px;height:0.95em;background:#fff;margin-left:2px;
    vertical-align:-2px;animation:blink .7s step-end infinite}
  .cursor.hide{opacity:0;animation:none}
  @keyframes blink{50%{opacity:0}}
</style></head><body>
<div class="row">
  <div class="bar" id="bar"></div>
  <div class="col">
    <div class="title"><span id="title"></span><span class="cursor" id="c1"></span></div>
    <div class="artist"><span id="artist"></span><span class="cursor hide" id="c2"></span></div>
  </div>
</div>
<script>
(function(){
  var title=${JSON.stringify(titleText)};
  var artist=${JSON.stringify(artistText)};
  var tEl=document.getElementById("title");
  var aEl=document.getElementById("artist");
  var c1=document.getElementById("c1");
  var c2=document.getElementById("c2");
  var i=0;
  function typeTitle(){
    i++;
    tEl.textContent=title.slice(0,i);
    if(i>=title.length){
      c1.classList.add("hide");
      if(artist){ c2.classList.remove("hide"); i=0; setTimeout(typeArtist, 200); }
      return;
    }
    setTimeout(typeTitle, 55);
  }
  function typeArtist(){
    i++;
    aEl.textContent=artist.slice(0,i);
    if(i>=artist.length){ c2.classList.add("hide"); return; }
    setTimeout(typeArtist, 45);
  }
  setTimeout(typeTitle, 400);
})();
</script></body></html>`;

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
        // Logo góc trên-phải
        {
          type: "image",
          src: logo,
          position: "top-right",
          x: -40,
          y: 28,
          width: 200,
          duration: -2,
          cache: true,
        },
        // VIDEO BY ONTOP typewriter loop
        {
          type: "html",
          html: htmlTypeLoop,
          width: 520,
          height: 80,
          x: 0,
          y: 0,
          duration: -2,
          cache: false,
        },
        // Lower third: bar + title/artist typewriter once
        {
          type: "html",
          html: htmlLower,
          width: 900,
          height: 160,
          x: 0,
          y: 560,
          duration: -2,
          cache: false,
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
              resize: "cover", // full màn hình, hết viền đen
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
