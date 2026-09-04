"use client";

import { useEffect, useState } from "react";

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

async function probeAudioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.src = src;
    a.onloadedmetadata = () => {
      const d = a.duration;
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    a.onerror = () => resolve(0);
    setTimeout(() => resolve(0), 8000);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không load được ảnh"));
    img.src = src;
  });
}

/** Đè cover + chữ rõ lên ảnh AI để tên/tác giả/P1 luôn đọc được */
async function overlayCoverAndText(opts: {
  aiDataUrl: string;
  coverSrc: string;
  songTitle: string;
  artist: string;
  part: string;
  durationLabel: string;
}): Promise<string> {
  const ai = await loadImage(opts.aiDataUrl);
  const cover = await loadImage(opts.coverSrc);
  const W = ai.naturalWidth;
  const H = ai.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(ai, 0, 0, W, H);

  // Scale album box theo tỉ lệ (gốc 1330x1182 → AI size)
  const sx = W / 1330;
  const sy = H / 1182;
  const album = {
    x: Math.round(805 * sx),
    y: Math.round(198 * sy),
    w: Math.round(335 * sx),
    h: Math.round(335 * sy),
  };
  const radius = Math.max(8, Math.round(16 * sx));

  const scale = Math.max(album.w / cover.naturalWidth, album.h / cover.naturalHeight);
  const sw = album.w / scale;
  const sh = album.h / scale;
  const csx = (cover.naturalWidth - sw) / 2;
  const csy = (cover.naturalHeight - sh) / 2;

  ctx.save();
  const { x, y, w, h } = album;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(cover, csx, csy, sw, sh, x, y, w, h);
  ctx.restore();

  // Text plate
  const plateY = y + h + Math.round(8 * sy);
  const plateH = Math.round(105 * sy);
  ctx.fillStyle = "rgba(8,8,12,0.94)";
  ctx.fillRect(x, plateY, w, plateH);

  ctx.fillStyle = "rgba(60,60,70,0.95)";
  ctx.fillRect(x + 10, plateY + Math.round(78 * sy), w - 20, Math.max(3, Math.round(4 * sy)));
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(x + 10, plateY + Math.round(78 * sy), (w - 20) * 0.1, Math.max(3, Math.round(4 * sy)));

  ctx.textBaseline = "top";
  const titleSize = Math.max(16, Math.round(28 * sy));
  const artistSize = Math.max(12, Math.round(17 * sy));
  const smallSize = Math.max(11, Math.round(14 * sy));

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${titleSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(opts.songTitle.trim().toUpperCase().slice(0, 36), x + 12, plateY + Math.round(12 * sy), w - 24);

  ctx.fillStyle = "rgba(210,210,215,0.98)";
  ctx.font = `600 ${artistSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(opts.artist.trim().toUpperCase().slice(0, 40), x + 12, plateY + Math.round(48 * sy), w - 24);

  ctx.fillStyle = "rgba(160,160,170,0.95)";
  ctx.font = `${smallSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText("0:00", x + 12, plateY + Math.round(86 * sy));
  const dur = opts.durationLabel;
  const dw = ctx.measureText(dur).width;
  ctx.fillText(dur, x + w - 12 - dw, plateY + Math.round(86 * sy));

  // P1 badge
  const bx = Math.round(28 * sx);
  const by = Math.round(22 * sy);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(bx, by, Math.round(250 * sx), Math.round(155 * sy));
  ctx.shadowColor = "rgba(255,180,0,0.9)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffe566";
  ctx.font = `bold ${Math.max(16, Math.round(30 * sy))}px Arial, Helvetica, sans-serif`;
  ctx.fillText("Nhạc Hay VL", bx + Math.round(20 * sx), by + Math.round(18 * sy));
  ctx.font = `bold ${Math.max(36, Math.round(72 * sy))}px Arial, Helvetica, sans-serif`;
  ctx.fillText(opts.part.trim().slice(0, 6) || "P1", bx + Math.round(24 * sx), by + Math.round(68 * sy));
  ctx.shadowBlur = 0;

  return canvas.toDataURL("image/jpeg", 0.95);
}

async function splitVertical(dataUrl: string) {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const half = Math.floor(w / 2);
  const mk = async (sx: number, sw: number) => {
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = h;
    c.getContext("2d")!.drawImage(img, sx, 0, sw, h, 0, 0, sw, h);
    return new Promise<Blob>((resolve, reject) => {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.95);
    });
  };
  const left = await mk(0, half);
  const right = await mk(half, w - half);
  return {
    left,
    right,
    leftUrl: URL.createObjectURL(left),
    rightUrl: URL.createObjectURL(right),
  };
}

export default function Home() {
  const [songTitle, setSongTitle] = useState("XIN ĐỪNG RỜI XA ANH");
  const [artist, setArtist] = useState("MP x VH Remix");
  const [part, setPart] = useState("P1");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [durationSec, setDurationSec] = useState(60);
  const [caption, setCaption] = useState(
    "XIN ĐỪNG RỜI XA ANH - MP x VH Remix 🔥 #vinahouse #remix #ontopmedia"
  );
  const [cookies, setCookies] = useState("");
  const [status, setStatus] = useState("AI Cloudflare tạo/sửa trong ảnh (không đè)");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [leftUrl, setLeftUrl] = useState<string | null>(null);
  const [rightUrl, setRightUrl] = useState<string | null>(null);
  const [leftBlob, setLeftBlob] = useState<Blob | null>(null);
  const [rightBlob, setRightBlob] = useState<Blob | null>(null);
  const [meta, setMeta] = useState("");

  useEffect(() => {
    (async () => {
      if (musicFile) {
        const src = URL.createObjectURL(musicFile);
        const d = await probeAudioDuration(src);
        URL.revokeObjectURL(src);
        if (d > 1) setDurationSec(d);
      } else if (musicUrl.trim()) {
        const d = await probeAudioDuration(musicUrl.trim());
        if (d > 1) setDurationSec(d);
      }
    })();
  }, [musicFile, musicUrl]);

  useEffect(() => {
    setCaption(`${songTitle} - ${artist} 🔥 #vinahouse #remix #ontopmedia #${part.toLowerCase()}`);
  }, [songTitle, artist, part]);

  const createImage = async () => {
    setError(null);
    setResultUrl(null);
    setLeftUrl(null);
    setRightUrl(null);
    setLeftBlob(null);
    setRightBlob(null);
    setIsWorking(true);
    try {
      if (!coverFile && !coverUrl.trim()) throw new Error("Cần ảnh cover (file hoặc link)");

      let dur = durationSec;
      if (musicFile) {
        const src = URL.createObjectURL(musicFile);
        const d = await probeAudioDuration(src);
        URL.revokeObjectURL(src);
        if (d > 1) dur = d;
      } else if (musicUrl.trim()) {
        const d = await probeAudioDuration(musicUrl.trim());
        if (d > 1) dur = d;
      }
      setDurationSec(dur);

      setStatus("Cloudflare AI đang tạo ảnh...");
      const fd = new FormData();
      fd.append("songTitle", songTitle);
      fd.append("artist", artist);
      fd.append("part", part);
      fd.append("durationSec", String(dur));
      if (coverFile) fd.append("cover", coverFile);
      if (coverUrl.trim()) fd.append("coverUrl", coverUrl.trim());

      const res = await fetch("/api/gemini/generate", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.imageBase64) {
        throw new Error(data.error || `AI thất bại (${res.status})`);
      }

      const mime = data.mimeType || "image/png";
      const dataUrl = `data:${mime};base64,${data.imageBase64}`;

      setResultUrl(dataUrl);
      setMeta(`AI thuần ${data.model || data.provider} · ${data.character || ""}`);
      setStatus("Đang cắt đôi dọc...");
      const split = await splitVertical(dataUrl);
      setLeftBlob(split.left);
      setRightBlob(split.right);
      setLeftUrl(split.leftUrl);
      setRightUrl(split.rightUrl);
      setStatus("✅ Xong — ảnh AI thuần (chữ/cover do AI vẽ trong ảnh).");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Lỗi");
      setStatus("Thất bại");
    } finally {
      setIsWorking(false);
    }
  };

  const postTikTok = async () => {
    if (!leftBlob || !rightBlob) {
      setError("Chưa có 2 ảnh đã cắt");
      return;
    }
    setIsWorking(true);
    setError(null);
    try {
      setStatus("Đang đăng TikTok...");
      const fd = new FormData();
      fd.append("caption", caption);
      if (cookies.trim()) fd.append("cookies", cookies.trim());
      fd.append("image1", leftBlob, "left.jpg");
      fd.append("image2", rightBlob, "right.jpg");
      const res = await fetch("/api/tiktok/post-photo", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) setStatus(`✅ Đã gửi đăng TikTok · ${data.itemId || ""}`);
      else throw new Error(data.error || "Đăng TikTok thất bại");
    } catch (e: any) {
      setError(e?.message || "Post failed");
      setStatus("Đăng TikTok thất bại — vẫn tải ảnh được");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#262626] bg-[#111] sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Ontop" className="h-9 w-auto object-contain" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">Ontop Media Music</h1>
              <p className="text-xs text-gray-400">Cloudflare AI (trong ảnh)</p>
            </div>
          </div>
          <div className="text-sm text-cyan-400 shrink-0">AI</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">1. Thông tin nhạc</h2>
          <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Tên bài"
            className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Tác giả"
            className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <div className="flex gap-3">
            <input value={part} onChange={(e) => setPart(e.target.value)} placeholder="P1"
              className="w-24 bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
            <div className="flex-1 text-sm text-gray-400 flex items-center">
              Thời lượng: {formatDuration(durationSec)}
            </div>
          </div>
        </section>

        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">2. Ảnh cover</h2>
          <input value={coverUrl} onChange={(e) => { setCoverUrl(e.target.value); setCoverFile(null); }}
            placeholder="Link ảnh https://..." className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setCoverFile(f); if (f) setCoverUrl(""); }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ff0050] file:text-white" />
          {coverFile && <p className="text-xs text-green-400">✓ {coverFile.name}</p>}
        </section>

        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">3. Nhạc (thời lượng)</h2>
          <input value={musicUrl} onChange={(e) => { setMusicUrl(e.target.value); setMusicFile(null); }}
            placeholder="Link nhạc" className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input type="file" accept="audio/*,.mp3,.m4a" onChange={(e) => { const f = e.target.files?.[0] || null; setMusicFile(f); if (f) setMusicUrl(""); }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00f2ea] file:text-black" />
          {musicFile && <p className="text-xs text-green-400">✓ {musicFile.name}</p>}
        </section>

        <button onClick={createImage} disabled={isWorking}
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-[#ff0050] to-[#00f2ea] disabled:opacity-50 text-lg">
          {isWorking ? "AI đang tạo…" : "Tạo ảnh AI"}
        </button>

        <div className="text-sm text-center text-gray-400 bg-[#141414] border border-[#262626] rounded-xl px-4 py-3">
          {status}
          {meta && <div className="text-xs text-gray-500 mt-1">{meta}</div>}
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl px-4 py-3 whitespace-pre-wrap">{error}</div>
        )}

        {resultUrl && (
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold">Ảnh AI</h2>
            <img src={resultUrl} alt="result" className="w-full rounded-xl" />
            <a href={resultUrl} download="ontop-ai.jpg" className="block text-center py-2 rounded-xl bg-[#333] text-sm">Tải ảnh</a>
          </section>
        )}

        {(leftUrl || rightUrl) && (
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold">Cắt đôi dọc</h2>
            <div className="grid grid-cols-2 gap-3">
              {leftUrl && <div><p className="text-xs text-gray-500 mb-1">Trái</p><img src={leftUrl} alt="left" className="w-full rounded-lg" /></div>}
              {rightUrl && <div><p className="text-xs text-gray-500 mb-1">Phải</p><img src={rightUrl} alt="right" className="w-full rounded-lg" /></div>}
            </div>
          </section>
        )}

        {leftBlob && rightBlob && (
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Đăng TikTok</h2>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 text-sm" />
            <textarea value={cookies} onChange={(e) => setCookies(e.target.value)} rows={2}
              placeholder="Cookie TikTok (tuỳ chọn)"
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 text-xs text-gray-400" />
            <button onClick={postTikTok} disabled={isWorking}
              className="w-full py-3 rounded-xl font-bold bg-[#ff0050] disabled:opacity-50">Đăng TikTok</button>
          </section>
        )}
      </main>
    </div>
  );
}
