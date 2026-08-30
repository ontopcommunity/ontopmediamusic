"use client";

import { useState, useRef, useEffect } from "react";

const proxyUrl = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

export default function Home() {
  const [songTitle, setSongTitle] = useState("MASHUP HOT TIKTOK - QUINVY REMIX");
  const [artist, setArtist] = useState("OCEAN MUSIC");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload nền + nhạc → Load Preview");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [tiktokCookies, setTiktokCookies] = useState("");
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);

  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const bgObjectUrl = useRef<string | null>(null);
  const musicObjectUrl = useRef<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const audioGraphRef = useRef<{
    ctx: AudioContext;
    source: MediaElementAudioSourceNode;
  } | null>(null);

  // Preload logo
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/logo.png";
    img.onload = () => {
      logoImgRef.current = img;
    };
    try {
      const saved = localStorage.getItem("tiktok_cookies");
      if (saved) setTiktokCookies(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (songTitle || artist) {
      const tags = ["#vinahouse", "#remix", "#xuhuong", "#nhactre", "#mashup", "#tiktok"];
      setCaption(`${songTitle} - ${artist}\n\n${tags.join(" ")}`);
    }
  }, [songTitle, artist]);

  useEffect(() => {
    return () => {
      if (bgObjectUrl.current) URL.revokeObjectURL(bgObjectUrl.current);
      if (musicObjectUrl.current) URL.revokeObjectURL(musicObjectUrl.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const loadPreview = async () => {
    setError(null);
    setOutputUrl(null);
    setPreviewReady(false);
    setProgress(0);

    if (!bgFile) {
      setError("Vui lòng upload video nền");
      return;
    }
    if (!musicFile && !musicUrl.trim()) {
      setError("Vui lòng upload file nhạc hoặc dán link nhạc");
      return;
    }

    try {
      setStatus("Đang load preview...");

      if (bgObjectUrl.current) URL.revokeObjectURL(bgObjectUrl.current);
      bgObjectUrl.current = URL.createObjectURL(bgFile);

      const video = bgVideoRef.current!;
      video.src = bgObjectUrl.current;
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      await video.play().catch(() => {});
      video.pause();
      video.currentTime = 0;

      const audio = audioRef.current!;
      if (musicObjectUrl.current) URL.revokeObjectURL(musicObjectUrl.current);
      if (musicFile) {
        musicObjectUrl.current = URL.createObjectURL(musicFile);
        audio.src = musicObjectUrl.current;
      } else {
        musicObjectUrl.current = null;
        audio.src = proxyUrl(musicUrl.trim());
      }
      audio.loop = false;

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Load nhạc timeout")), 20000);
        audio.onloadedmetadata = () => {
          clearTimeout(t);
          resolve();
        };
        audio.onerror = () => {
          clearTimeout(t);
          reject(new Error("Không load được nhạc (thử file mp3)"));
        };
        audio.load();
      });

      let d = audio.duration;
      if (!isFinite(d) || d < 3) d = 30;
      if (d > 120) d = 120;
      setDuration(d);

      if (video.duration && isFinite(video.duration) && video.duration > d + 1) {
        video.currentTime = Math.random() * (video.duration - d);
      } else {
        video.currentTime = 0;
      }

      setPreviewReady(true);
      setStatus(`Preview sẵn sàng (~${d.toFixed(0)}s)`);
    } catch (e: any) {
      setError(e?.message || "Lỗi load preview");
      setStatus("Thất bại");
    }
  };

  const playPreview = async () => {
    if (!previewReady) return;
    try {
      await bgVideoRef.current!.play();
      await audioRef.current!.play();
      setStatus("Đang phát preview...");
    } catch (e: any) {
      setError(e?.message || "Không phát được");
    }
  };

  /**
   * Layout mẫu:
   * - Logo trên-trái (to hơn một chút)
   * - Chữ dưới-trái nhỏ gọn + gạch dọc (tỉ lệ giống ảnh mẫu)
   * - progress 0..1: Ken Burns zoom-in + pan, cover crop 1280x720
   * Font: Montserrat (giống style music video)
   */
  const drawFrame = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
    progress = 0
  ) => {
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;

    // Cover base scale, rồi phóng to dần (1.0 → 1.18) + pan nhẹ
    const p = Math.min(1, Math.max(0, progress));
    const zoom = 1 + p * 0.18;
    const base = Math.max(w / vw, h / vh) * zoom;
    const dw = vw * base;
    const dh = vh * base;
    // pan: dịch nhẹ sang phải-xuống khi zoom
    const dx = (w - dw) / 2 - p * (dw - w) * 0.15;
    const dy = (h - dh) / 2 - p * (dh - h) * 0.1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.restore();

    // Gradient đáy nhẹ
    const grad = ctx.createLinearGradient(0, h * 0.62, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);

    // Logo top-left — to hơn (~14.5% width)
    const logo = logoImgRef.current;
    if (logo && logo.complete && logo.naturalWidth > 0) {
      const logoW = Math.round(w * 0.15);
      const logoH = Math.round((logo.naturalHeight / logo.naturalWidth) * logoW);
      const lx = Math.round(w * 0.028);
      const ly = Math.round(h * 0.035);
      ctx.drawImage(logo, lx, ly, logoW, logoH);
    }

    // Text nhỏ gọn bottom-left (tỉ lệ mẫu)
    const title = (songTitle || "").toUpperCase().slice(0, 90);
    const sub = (artist || "").toUpperCase().slice(0, 60);

    const leftPad = Math.round(w * 0.035);
    const barW = Math.max(3, Math.round(w * 0.0035));
    // Tỉ lệ đo từ ảnh mẫu (~3.2% / ~2.0% chiều rộng khung)
    const titleSize = Math.round(w * 0.032);
    const subSize = Math.round(w * 0.02);
    const textX = leftPad + barW + Math.round(w * 0.012);
    const baseY = h - Math.round(h * 0.085);

    const fontTitle = `700 ${titleSize}px Montserrat, "Segoe UI", sans-serif`;
    const fontSub = `600 ${subSize}px Montserrat, "Segoe UI", sans-serif`;

    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = fontTitle;
    const titleH = titleSize * 1.1;
    ctx.font = fontSub;
    const subH = subSize * 1.15;
    const gap = Math.round(h * 0.008);
    const blockH = titleH + gap + subH;
    const barTop = baseY - blockH;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(leftPad, barTop, barW, baseY - barTop);

    ctx.font = fontTitle;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillText(title, textX, baseY - subH - gap);

    ctx.font = fontSub;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(sub, textX, baseY);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  const getAudioStream = async (audio: HTMLAudioElement) => {
    if (audioGraphRef.current) {
      return audioGraphRef.current.ctx.createMediaStreamDestination().stream;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(ctx.destination);
    audioGraphRef.current = { ctx, source };
    // reconnect source to new dest each export
    return dest.stream;
  };

  const exportAndDownload = async () => {
    if (!previewReady || !bgVideoRef.current || !audioRef.current) {
      setError("Chưa có preview. Bấm Load Preview trước.");
      return;
    }

    setIsRecording(true);
    setError(null);
    setOutputUrl(null);
    setProgress(0);
    setStatus("Đang xuất video...");

    const video = bgVideoRef.current;
    const audio = audioRef.current;
    const canvas = canvasRef.current!;
    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const total = Math.min(duration, 120);

    try {
      // Ensure logo loaded
      if (!logoImgRef.current) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = "/logo.png";
          img.onload = () => {
            logoImgRef.current = img;
            resolve();
          };
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 3000);
        });
      }

      const canvasStream = canvas.captureStream(30);

      // Audio: create graph once
      let audioCtx: AudioContext;
      let dest: MediaStreamAudioDestinationNode;
      if (!audioGraphRef.current) {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audio);
        dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);
        audioGraphRef.current = { ctx: audioCtx, source };
      } else {
        audioCtx = audioGraphRef.current.ctx;
        dest = audioCtx.createMediaStreamDestination();
        try {
          audioGraphRef.current.source.disconnect();
        } catch {}
        audioGraphRef.current.source.connect(dest);
        audioGraphRef.current.source.connect(audioCtx.destination);
      }

      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      const mime =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

      chunksRef.current = [];
      const recorder = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: 5_000_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };

      const done = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mime }));
        recorder.onerror = () => reject(new Error("MediaRecorder error"));
      });

      recorder.start(200);
      audio.currentTime = 0;
      await video.play();
      await audio.play();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      // Đợi font Montserrat sẵn sàng trước khi vẽ chữ
      try {
        await (document as any).fonts?.load?.('700 24px Montserrat');
        await (document as any).fonts?.load?.('600 16px Montserrat');
      } catch {}

      const t0 = performance.now();
      const drawLoop = () => {
        const elapsed = (performance.now() - t0) / 1000;
        const prog = Math.min(1, elapsed / total);
        // Ken Burns: phóng to + pan dần trong suốt video
        drawFrame(ctx, video, W, H, prog);
        setProgress(Math.min(99, Math.round(prog * 100)));
        if (elapsed < total && recorder.state === "recording") {
          rafRef.current = requestAnimationFrame(drawLoop);
        }
      };
      rafRef.current = requestAnimationFrame(drawLoop);

      await new Promise((r) => setTimeout(r, total * 1000));

      cancelAnimationFrame(rafRef.current);
      video.pause();
      audio.pause();
      if (recorder.state === "recording") recorder.stop();

      const blob = await done;
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setProgress(100);

      const a = document.createElement("a");
      a.href = url;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      a.download = `${(songTitle || "video").replace(/\s+/g, "_").slice(0, 40)}_720p.${ext}`;
      a.click();
      setStatus("✅ Đã xuất & tải file (layout chuẩn logo + chữ)");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Xuất thất bại — dùng Chrome/Edge");
      setStatus("Thất bại");
      video.pause();
      audio.pause();
    } finally {
      setIsRecording(false);
    }
  };

  const postToTikTok = async () => {
    if (!outputUrl) {
      setPostResult("Cần xuất video trước");
      return;
    }
    setPosting(true);
    setPostResult(null);
    try {
      try {
        localStorage.setItem("tiktok_cookies", tiktokCookies);
      } catch {}
      const videoBlob = await fetch(outputUrl).then((r) => r.blob());
      const form = new FormData();
      form.append("video", videoBlob, "video.webm");
      form.append("caption", caption);
      form.append("cookies", tiktokCookies);
      const res = await fetch("/api/tiktok/post", { method: "POST", body: form });
      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`);
      }
      if (!res.ok || data.success === false) throw new Error(data.error || "Đăng thất bại");
      setPostResult("✅ " + (data.message || "Đã gửi đăng"));
    } catch (e: any) {
      setPostResult("❌ " + (e.message || "Lỗi"));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#262626] bg-[#111] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Ontop" className="h-9 w-auto object-contain" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Ontop Media Music</h1>
              <p className="text-xs text-gray-400">Preview = Export · Layout chuẩn</p>
            </div>
          </div>
          <div className="text-sm text-green-400">● Live Preview</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#ff0050] text-xs flex items-center justify-center">
                1
              </span>
              Thông tin nhạc
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tên bài hát</label>
                <input
                  type="text"
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050] transition"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tác giả / Label</label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050] transition"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Nhạc: link hoặc upload file
                </label>
                <input
                  type="text"
                  value={musicUrl}
                  onChange={(e) => {
                    setMusicUrl(e.target.value);
                    setMusicFile(null);
                    if (musicInputRef.current) musicInputRef.current.value = "";
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050] transition mb-2"
                  placeholder="https://...mp3"
                />
                <input
                  ref={musicInputRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setMusicFile(f);
                      setMusicUrl("");
                    }
                  }}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ff0050] file:text-white file:cursor-pointer"
                />
                {musicFile && (
                  <p className="text-xs text-green-400 mt-2">
                    ✓ {musicFile.name} ({(musicFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#ff0050] text-xs flex items-center justify-center">
                2
              </span>
              Video nền (upload)
            </h2>
            <input
              ref={bgInputRef}
              type="file"
              accept="video/*,.mp4,.webm,.mov"
              onChange={(e) => setBgFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00f2ea] file:text-black file:font-medium file:cursor-pointer"
            />
            {bgFile && (
              <p className="text-xs text-green-400 mt-2">
                ✓ {bgFile.name} ({(bgFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={loadPreview}
              disabled={isRecording}
              className="py-3 rounded-xl font-semibold bg-[#262626] hover:bg-[#333] disabled:opacity-50"
            >
              Load Preview
            </button>
            <button
              onClick={playPreview}
              disabled={!previewReady || isRecording}
              className="py-3 rounded-xl font-semibold bg-[#262626] hover:bg-[#333] disabled:opacity-50"
            >
              Phát
            </button>
            <button
              onClick={exportAndDownload}
              disabled={!previewReady || isRecording}
              className="py-3 rounded-xl font-bold bg-gradient-to-r from-[#ff0050] to-[#00f2ea] disabled:opacity-50"
            >
              {isRecording ? `${progress}%` : "Xuất & Tải"}
            </button>
          </div>

          {status && (
            <div className="text-sm text-center text-gray-400 bg-[#141414] border border-[#262626] rounded-xl px-4 py-3">
              {status}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl px-4 py-3">
              {error}
            </div>
          )}
          {isRecording && (
            <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#ff0050] to-[#00f2ea] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Preview (giống file xuất)</h2>
            {/* Frame tỷ lệ 16:9 — layout giống ảnh mẫu 100% */}
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-[#333] shadow-lg">
              <video
                ref={bgVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
                loop
              />
              {/* Gradient đáy */}
              <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

              {/* Logo góc trên trái */}
              <img
                src="/logo.png"
                alt="Ontop"
                className="absolute z-10 object-contain pointer-events-none"
                style={{
                  left: "2.8%",
                  top: "3.5%",
                  width: "15%",
                  height: "auto",
                }}
              />

              {/* Chữ góc dưới trái + gạch dọc */}
              <div
                className="absolute z-10 flex items-stretch pointer-events-none"
                style={{ left: "3.5%", bottom: "8%", maxWidth: "88%" }}
              >
                <div
                  className="bg-white shrink-0 self-stretch rounded-[1px]"
                  style={{ width: 4, minHeight: 52 }}
                />
                <div className="pl-3 flex flex-col justify-end min-w-0">
                  <p
                    className="text-white font-bold uppercase leading-tight tracking-wide"
                    style={{
                      fontFamily: "var(--font-montserrat), Montserrat, sans-serif",
                      fontSize: "clamp(14px, 2.8vw, 22px)",
                      textShadow: "0 2px 10px rgba(0,0,0,0.65)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {songTitle}
                  </p>
                  <p
                    className="text-white/90 font-semibold uppercase leading-tight mt-0.5 tracking-wide"
                    style={{
                      fontFamily: "var(--font-montserrat), Montserrat, sans-serif",
                      fontSize: "clamp(11px, 1.8vw, 15px)",
                      textShadow: "0 2px 8px rgba(0,0,0,0.55)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {artist}
                  </p>
                </div>
              </div>
            </div>
            <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
            <canvas ref={canvasRef} className="hidden" />
            <p className="text-xs text-gray-500 mt-3 text-center">
              Logo trên-trái · Chữ dưới-trái + gạch trắng · Preview = khung xuất
            </p>
          </section>

          {outputUrl && (
            <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-3">
              <h2 className="text-lg font-semibold">File đã xuất</h2>
              <video src={outputUrl} controls className="w-full rounded-xl bg-black max-h-64" />
              <a
                href={outputUrl}
                download
                className="block text-center py-3 rounded-xl bg-[#ff0050] font-medium"
              >
                Tải lại
              </a>
              <div className="border-t border-[#333] pt-4 space-y-2">
                <label className="block text-sm text-gray-400">Caption TikTok</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#ff0050] resize-none"
                />
                <label className="block text-sm text-gray-400">Cookie (sessionid)</label>
                <textarea
                  value={tiktokCookies}
                  onChange={(e) => setTiktokCookies(e.target.value)}
                  rows={2}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#ff0050] resize-none"
                />
                <button
                  onClick={postToTikTok}
                  disabled={posting}
                  className="w-full py-3 rounded-xl bg-[#00f2ea] text-black font-semibold disabled:opacity-50"
                >
                  {posting ? "Đang đăng..." : "Đăng TikTok"}
                </button>
                {postResult && (
                  <p className="text-xs text-gray-300 break-words">{postResult}</p>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-[#262626] mt-12 py-6 text-center text-sm text-gray-500">
        Ontop Media Music • Layout chuẩn mẫu • 1280×720
      </footer>
    </div>
  );
}
