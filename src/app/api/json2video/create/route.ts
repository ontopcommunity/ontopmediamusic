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

    // HTML tĩnh + JS typewriter — wait đủ để JS chạy; duration full scene
    // VIDEO BY ONTOP: lặp gõ/xóa + cursor
    const htmlTopLeft = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:rgba(0,0,0,0);overflow:hidden}
body{display:flex;align-items:flex-start;justify-content:flex-start;padding:32px 36px}
.w{font-family:Inter,Arial,sans-serif;font-weight:600;font-size:22px;color:#fff;
text-shadow:0 2px 8px rgba(0,0,0,.75);letter-spacing:.04em;white-space:nowrap}
.c{display:inline-block;width:2px;height:1.1em;background:#fff;margin-left:3px;
vertical-align:-2px;animation:b .7s step-end infinite}
@keyframes b{50%{opacity:0}}
</style></head><body>
<div class="w"><span id="t">VIDEO BY ONTOP</span><span class="c"></span></div>
<script>
(function(){
  var full="VIDEO BY ONTOP", el=document.getElementById("t"), i=full.length, del=false;
  el.textContent=full;
  function tick(){
    if(!del){
      i++; el.textContent=full.slice(0,i);
      if(i>=full.length){ setTimeout(function(){ del=true; tick(); },2000); return; }
      setTimeout(tick,85);
    } else {
      i--; el.textContent=full.slice(0,Math.max(0,i));
      if(i<=0){ del=false; setTimeout(tick,2000); return; }
      setTimeout(tick,30);
    }
  }
  setTimeout(function(){ del=true; tick(); },2000);
})();
</script></body></html>`;

    // Lower third: bar + title/artist typewriter once (text hiện sẵn sau vài trăm ms)
    const htmlBottom = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:rgba(0,0,0,0);overflow:hidden}
body{display:flex;align-items:flex-end;justify-content:flex-start;padding:24px 40px 40px}
.row{display:flex;align-items:stretch;gap:14px;max-width:95%}
.bar{width:3px;min-height:56px;background:#fff;border-radius:1px;flex-shrink:0;
box-shadow:0 0 6px rgba(0,0,0,.45)}
.col{display:flex;flex-direction:column;justify-content:center;gap:6px}
.title{font-family:"Be Vietnam Pro",Inter,Arial,sans-serif;font-weight:700;font-size:26px;
color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.7);text-transform:uppercase;
letter-spacing:.02em;line-height:1.2;white-space:nowrap}
.artist{font-family:Inter,Arial,sans-serif;font-weight:500;font-size:15px;
color:rgba(255,255,255,.92);text-shadow:0 1px 6px rgba(0,0,0,.55);
text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
.c{display:inline-block;width:2px;height:.95em;background:#fff;margin-left:2px;
vertical-align:-2px;animation:b .7s step-end infinite}
.c.off{opacity:0;animation:none}
@keyframes b{50%{opacity:0}}
</style></head><body>
<div class="row">
  <div class="bar"></div>
  <div class="col">
    <div class="title"><span id="title"></span><span class="c" id="c1"></span></div>
    <div class="artist"><span id="artist"></span><span class="c off" id="c2"></span></div>
  </div>
</div>
<script>
(function(){
  var title=${JSON.stringify(titleText)};
  var artist=${JSON.stringify(artistText)};
  var tEl=document.getElementById("title"), aEl=document.getElementById("artist");
  var c1=document.getElementById("c1"), c2=document.getElementById("c2");
  var i=0;
  // Hiện ngay 1 phần để nếu chỉ chụp 1 frame vẫn thấy chữ
  tEl.textContent=title;
  aEl.textContent=artist;
  c1.classList.add("off");
  function typeTitle(){
    i++; tEl.textContent=title.slice(0,i);
    if(i>=title.length){
      c1.classList.add("off");
      if(artist){ c2.classList.remove("off"); i=0; setTimeout(typeArtist,180); }
      return;
    }
    setTimeout(typeTitle,50);
  }
  function typeArtist(){
    i++; aEl.textContent=artist.slice(0,i);
    if(i>=artist.length){ c2.classList.add("off"); return; }
    setTimeout(typeArtist,40);
  }
  // Reset rồi gõ lại (hiệu ứng gõ) sau khi đã có text full làm fallback
  setTimeout(function(){ i=0; tEl.textContent=""; aEl.textContent=""; c1.classList.remove("off"); typeTitle(); }, 300);
})();
</script></body></html>`;

    const movie = {
      comment: "Ontop Media Music",
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
        // Logo góc trên-phải
        {
          type: "image",
          src: logo,
          position: "top-right",
          x: -36,
          y: 24,
          width: 190,
          duration: -2,
          cache: true,
        },
        // VIDEO BY ONTOP — top left (html animated)
        {
          type: "html",
          html: htmlTopLeft,
          width: 480,
          height: 90,
          x: 8,
          y: 8,
          duration: -2,
          cache: false,
          wait: 1,
        },
        // Tên + tác giả + thanh dọc — bottom left
        {
          type: "html",
          html: htmlBottom,
          width: 1000,
          height: 140,
          position: "bottom-left",
          x: 8,
          y: -8,
          duration: -2,
          cache: false,
          wait: 1,
        },
        // Fallback text native (luôn hiện nếu html lỗi / chỉ chụp frame trống)
        {
          type: "text",
          text: "VIDEO BY ONTOP",
          start: 0,
          duration: -2,
          position: "top-left",
          x: 40,
          y: 36,
          zIndex: 1,
          settings: {
            "font-family": "Inter",
            "font-weight": "600",
            "font-size": "22px",
            color: "#ffffff",
            "text-shadow": "0 2px 8px rgba(0,0,0,0.75)",
            "letter-spacing": "0.04em",
          },
        },
        {
          type: "text",
          style: "004",
          text: titleText,
          start: 0.3,
          duration: -2,
          position: "bottom-left",
          x: 64,
          y: -78,
          settings: {
            "font-family": "Be Vietnam Pro",
            "font-weight": "700",
            "font-size": "26px",
            color: "#ffffff",
            "text-shadow": "0 2px 10px rgba(0,0,0,0.7)",
            "text-transform": "uppercase",
          },
        },
        {
          type: "text",
          style: "004",
          text: artistText || " ",
          start: 1.2,
          duration: -2,
          position: "bottom-left",
          x: 64,
          y: -48,
          settings: {
            "font-family": "Inter",
            "font-weight": "500",
            "font-size": "15px",
            color: "rgba(255,255,255,0.92)",
            "text-shadow": "0 1px 6px rgba(0,0,0,0.55)",
            "text-transform": "uppercase",
            "letter-spacing": "0.08em",
          },
        },
        // Thanh dọc trắng trước cụm tên (dùng html tĩnh nhỏ — chắc chắn hơn)
        {
          type: "html",
          html: `<!DOCTYPE html><html><body style="margin:0;background:transparent">
<div style="width:3px;height:58px;background:#fff;border-radius:1px;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>
</body></html>`,
          width: 8,
          height: 70,
          position: "bottom-left",
          x: 44,
          y: -40,
          duration: -2,
          cache: true,
          wait: 0,
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
