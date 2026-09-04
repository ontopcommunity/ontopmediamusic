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

async function splitVertical(
  dataUrl: string
): Promise<{ left: Blob; right: Blob; leftUrl: string; rightUrl: string }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Không load được ảnh để cắt"));
    img.src = dataUrl;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const half = Math.floor(w / 2);

  const mk = (sx: number, sw: number) => {
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, sx, 0, sw, h, 0, 0, sw, h);
    return new Promise<Blob>((resolve, reject) => {
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.95
      );
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
    "XIN ĐỪNG RỜI XA ANH - MP x VH Remix 🔥 #vinahouse #remix #xindungroixaanh #ontopmedia"
  );
  const [cookies, setCookies] = useState("");
  const [status, setStatus] = useState("Nhập thông tin → Tạo ảnh Gemini → Cắt đôi → Đăng TikTok");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [leftUrl, setLeftUrl] = useState<string | null>(null);
  const [rightUrl, setRightUrl] = useState<string | null>(null);
  const [leftBlob, setLeftBlob] = useState<Blob | null>(null);
  const [rightBlob, setRightBlob] = useState<Blob | null>(null);
  const [meta, setMeta] = useState<string>("");

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

      let musicResolved = musicUrl.trim();
      if (!musicFile && musicResolved) {
        setStatus("Đang resolve link nhạc...");
        const rr = await fetch("/api/music/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: musicResolved }),
        });
        const rd = await rr.json();
        if (rd.audioUrl) musicResolved = rd.audioUrl;
      }

      let dur = durationSec;
      if (musicFile) {
        const src = URL.createObjectURL(musicFile);
        const d = await probeAudioDuration(src);
        URL.revokeObjectURL(src);
        if (d > 1) dur = d;
      } else if (musicResolved) {
        const d = await probeAudioDuration(musicResolved);
        if (d > 1) dur = d;
      }
      setDurationSec(dur);

      setStatus("Gemini đang chỉnh ảnh mẫu (anime + thẻ nhạc)...");
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
        throw new Error(data.error || data.detail || `Gemini lỗi ${res.status}`);
      }

      const mime = data.mimeType || "image/png";
      const dataUrl = `data:${mime};base64,${data.imageBase64}`;
      setResultUrl(dataUrl);
      setMeta(
        `NV: ${data.character || "?"} · ${data.partLabel || part} · ${data.durationLabel || formatDuration(dur)}`
      );
      setStatus("Đang cắt đôi ảnh dọc (trái / phải)...");

      const split = await splitVertical(dataUrl);
      setLeftBlob(split.left);
      setRightBlob(split.right);
      setLeftUrl(split.leftUrl);
      setRightUrl(split.rightUrl);
      setStatus("✅ Xong — xem ảnh full + 2 nửa. Có thể đăng TikTok.");
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
      setStatus("Đang đăng photo carousel lên TikTok...");
      const fd = new FormData();
      fd.append("caption", caption);
      if (cookies.trim()) fd.append("cookies", cookies.trim());
      fd.append("image1", leftBlob, "left.jpg");
      fd.append("image2", rightBlob, "right.jpg");
      const res = await fetch("/api/tiktok/post-photo", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setStatus(`✅ Đã gửi đăng TikTok · item ${data.itemId || ""}`);
      } else {
        throw new Error(
          data.error || "Đăng TikTok thất bại (cookie/API). Ảnh vẫn tải được phía trên."
        );
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
              <p className="text-xs text-gray-400">Gemini ảnh · Cắt đôi · Photo TikTok</p>
            </div>
          </div>
          <div className="text-sm text-cyan-400 shrink-0">No video</div>
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
          <h2 className="text-lg font-semibold">2. Ảnh cover (trong thẻ nhạc)</h2>
          <input value={coverUrl} onChange={(e) => { setCoverUrl(e.target.value); setCoverFile(null); }}
            placeholder="Link ảnh https://..." className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setCoverFile(f); if (f) setCoverUrl(""); }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ff0050] file:text-white" />
          {coverFile && <p className="text-xs text-green-400">✓ {coverFile.name}</p>}
        </section>

        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">3. Nhạc (file / link)</h2>
          <input value={musicUrl} onChange={(e) => { setMusicUrl(e.target.value); setMusicFile(null); }}
            placeholder="Link nhạc" className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3" />
          <input type="file" accept="audio/*,.mp3,.m4a" onChange={(e) => { const f = e.target.files?.[0] || null; setMusicFile(f); if (f) setMusicUrl(""); }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00f2ea] file:text-black" />
          {musicFile && <p className="text-xs text-green-400">✓ {musicFile.name}</p>}
        </section>

        <button onClick={createImage} disabled={isWorking}
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-[#ff0050] to-[#00f2ea] disabled:opacity-50 text-lg">
          {isWorking ? "Đang xử lý…" : "Tạo ảnh (Gemini)"}
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
            <h2 className="text-lg font-semibold">Ảnh Gemini (full)</h2>
            <img src={resultUrl} alt="result" className="w-full rounded-xl" />
            <a href={resultUrl} download="ontop-full.png" className="block text-center py-2 rounded-xl bg-[#333] text-sm">Tải ảnh full</a>
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
              placeholder="Cookie TikTok (sessionid...) — hoặc env TIKTOK_COOKIES"
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 text-xs text-gray-400" />
            <button onClick={postTikTok} disabled={isWorking}
              className="w-full py-3 rounded-xl font-bold bg-[#ff0050] disabled:opacity-50">Đăng TikTok</button>
          </section>
        )}
      </main>
    </div>
  );
}
