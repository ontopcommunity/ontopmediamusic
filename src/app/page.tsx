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

/**
 * Ghép đúng ảnh mẫu full resolution:
 * - Giữ 100% nhân vật, nền, khung thẻ
 * - Chèn cover vào đúng khung album
 * - Vẽ tên bài / tác giả / thời lượng / P1 rõ, đọc được
 */
async function compositeExact(opts: {
  templateUrl: string;
  coverSrc: string;
  songTitle: string;
  artist: string;
  part: string;
  durationLabel: string;
}): Promise<{ dataUrl: string; blob: Blob }> {
  const tpl = await loadImage(opts.templateUrl);
  const cover = await loadImage(opts.coverSrc);

  const W = tpl.naturalWidth || 1330;
  const H = tpl.naturalHeight || 1182;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tpl, 0, 0, W, H);

  // Khung album trong thẻ (căn theo ảnh mẫu 1330x1182)
  const album = { x: 805, y: 198, w: 335, h: 335 };
  const radius = 16;

  // Center-crop cover vào album
  const scale = Math.max(album.w / cover.naturalWidth, album.h / cover.naturalHeight);
  const sw = album.w / scale;
  const sh = album.h / scale;
  const sx = (cover.naturalWidth - sw) / 2;
  const sy = (cover.naturalHeight - sh) / 2;

  ctx.save();
  ctx.beginPath();
  const { x, y, w, h } = album;
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(cover, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();

  // Đè vùng chữ cũ dưới album (title / artist / duration)
  const plateX = album.x;
  const plateY = album.y + album.h + 8;
  const plateW = album.w;
  const plateH = 105;
  ctx.fillStyle = "rgba(8, 8, 12, 0.94)";
  ctx.fillRect(plateX, plateY, plateW, plateH);

  // Thanh progress mỏng
  ctx.fillStyle = "rgba(60, 60, 70, 0.95)";
  ctx.fillRect(plateX + 10, plateY + 78, plateW - 20, 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(plateX + 10, plateY + 78, (plateW - 20) * 0.08, 4);

  // Tên bài — chữ trắng đậm, rõ
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial, Helvetica, sans-serif";
  const title = opts.songTitle.trim().toUpperCase().slice(0, 36);
  ctx.fillText(title, plateX + 12, plateY + 12, plateW - 24);

  // Tác giả
  ctx.fillStyle = "rgba(210, 210, 215, 0.98)";
  ctx.font = "600 17px Arial, Helvetica, sans-serif";
  ctx.fillText(opts.artist.trim().toUpperCase().slice(0, 40), plateX + 12, plateY + 48, plateW - 24);

  // Thời lượng
  ctx.fillStyle = "rgba(160, 160, 170, 0.95)";
  ctx.font = "14px Arial, Helvetica, sans-serif";
  ctx.fillText("0:00", plateX + 12, plateY + 86);
  const dur = opts.durationLabel;
  const dw = ctx.measureText(dur).width;
  ctx.fillText(dur, plateX + plateW - 12 - dw, plateY + 86);

  // Badge P1 + Nhạc Hay VL (góc trên trái) — đè chữ cũ, chữ rõ
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(28, 22, 250, 155);
  ctx.shadowColor = "rgba(255, 180, 0, 0.85)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ffe566";
  ctx.font = "bold 30px Arial, Helvetica, sans-serif";
  ctx.fillText("Nhạc Hay VL", 48, 40);
  ctx.font = "bold 72px Arial, Helvetica, sans-serif";
  ctx.fillText(opts.part.trim().slice(0, 6) || "P1", 52, 90);
  ctx.shadowBlur = 0;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob fail"))), "image/jpeg", 0.95)
  );
  return { dataUrl, blob };
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
  const [status, setStatus] = useState("Nhập thông tin → Ghép ảnh mẫu → Cắt đôi → TikTok");
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
    setCaption(
      `${songTitle} - ${artist} 🔥 #vinahouse #remix #ontopmedia #${part.toLowerCase()}`
    );
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
      if (!coverFile && !coverUrl.trim()) {
        throw new Error("Cần ảnh cover (file hoặc link)");
      }

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

      setStatus("Đang ghép ảnh mẫu full-HD: cover + chữ rõ...");
      const coverSrc = coverFile ? URL.createObjectURL(coverFile) : coverUrl.trim();

      const { dataUrl } = await compositeExact({
        templateUrl: "/template-music-card.png",
        coverSrc,
        songTitle,
        artist,
        part,
        durationLabel: formatDuration(dur),
      });
      if (coverFile) URL.revokeObjectURL(coverSrc);

      setResultUrl(dataUrl);
      setMeta(`Ghép mẫu full-res · ${part} · ${formatDuration(dur)} · chữ rõ`);
      setStatus("Đang cắt đôi dọc...");
      const split = await splitVertical(dataUrl);
      setLeftBlob(split.left);
      setRightBlob(split.right);
      setLeftUrl(split.leftUrl);
      setRightUrl(split.rightUrl);
      setStatus("✅ Xong — giữ nguyên nhân vật/nền mẫu, cover + tên/tác giả rõ.");
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
      if (data.success) {
        setStatus(`✅ Đã gửi đăng TikTok · ${data.itemId || ""}`);
      } else {
        throw new Error(data.error || "Đăng TikTok thất bại — vẫn tải ảnh được");
      }
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
              <p className="text-xs text-gray-400">Ghép ảnh mẫu full-HD · Chữ rõ · Cắt đôi</p>
            </div>
          </div>
          <div className="text-sm text-cyan-400 shrink-0">Exact</div>
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
          <h2 className="text-lg font-semibold">2. Ảnh cover (chèn vào thẻ nhạc)</h2>
          <input value={coverUrl} onChange={(e) => { setCoverUrl(e.target.value); setCoverFile(null); }}
            placeholder="Link ảnh https://..." className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setCoverFile(f); if (f) setCoverUrl(""); }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ff0050] file:text-white" />
          {coverFile && <p className="text-xs text-green-400">✓ {coverFile.name}</p>}
        </section>

        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">3. Nhạc (đo thời lượng thanh tua)</h2>
          <input value={musicUrl} onChange={(e) => { setMusicUrl(e.target.value); setMusicFile(null); }}
            placeholder="Link nhạc" className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input type="file" accept="audio/*,.mp3,.m4a" onChange={(e) => { const f = e.target.files?.[0] || null; setMusicFile(f); if (f) setMusicUrl(""); }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00f2ea] file:text-black" />
          {musicFile && <p className="text-xs text-green-400">✓ {musicFile.name}</p>}
        </section>

        <button onClick={createImage} disabled={isWorking}
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-[#ff0050] to-[#00f2ea] disabled:opacity-50 text-lg">
          {isWorking ? "Đang ghép…" : "Tạo ảnh (ghép mẫu chính xác)"}
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
            <h2 className="text-lg font-semibold">Ảnh đã ghép</h2>
            <img src={resultUrl} alt="result" className="w-full rounded-xl" />
            <a href={resultUrl} download="ontop-full.jpg" className="block text-center py-2 rounded-xl bg-[#333] text-sm">Tải ảnh full</a>
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
            <h2 className="text-lg font-semibold">Đăng TikTok (photo lướt)</h2>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 text-sm" />
            <textarea value={cookies} onChange={(e) => setCookies(e.target.value)} rows={2}
              placeholder="Cookie TikTok (tuỳ chọn)"
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 text-xs text-gray-400" />
            <button onClick={postTikTok} disabled={isWorking}
              className="w-full py-3 rounded-xl font-bold bg-[#ff0050] disabled:opacity-50">Đăng TikTok</button>
          </section>
        )}

        <p className="text-xs text-gray-600 text-center leading-relaxed">
          Giữ nguyên 100% nhân vật + nền ảnh mẫu. Chỉ thay ảnh trong thẻ, tên bài, tác giả, thời lượng và P1 bằng chữ rõ.
        </p>
      </main>
    </div>
  );
}
