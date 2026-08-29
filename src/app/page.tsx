"use client";

import { useState, useRef, useEffect } from "react";

const proxyUrl = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

export default function Home() {
  const [songTitle, setSongTitle] = useState("Phía Sau Một Cô Gái");
  const [artist, setArtist] = useState("Đại Ngố Remix - NTP Vinahouse");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload nền + nhạc → bấm Preview");
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
  const bgObjectUrl = useRef<string | null>(null);
  const musicObjectUrl = useRef<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tiktok_cookies");
      if (saved) setTiktokCookies(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (songTitle || artist) {
      const tags = [
        "#phiasaumotcogai",
        "#vinahouse",
        "#remix",
        "#xuhuong",
        "#ntpvinahouse",
        "#nhactre",
        "#vietmix",
        "#daingot",
      ];
      setCaption(`${songTitle} - ${artist}\n\n${tags.join(" ")}`);
    }
  }, [songTitle, artist]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (bgObjectUrl.current) URL.revokeObjectURL(bgObjectUrl.current);
      if (musicObjectUrl.current) URL.revokeObjectURL(musicObjectUrl.current);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
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
          reject(new Error("Không load được nhạc (thử file mp3 hoặc link khác)"));
        };
        audio.load();
      });

      let d = audio.duration;
      if (!isFinite(d) || d < 3) d = 30;
      if (d > 120) d = 120;
      setDuration(d);

      // Random start on bg if longer than music
      if (video.duration && isFinite(video.duration) && video.duration > d + 1) {
        video.currentTime = Math.random() * (video.duration - d);
      } else {
        video.currentTime = 0;
      }

      setPreviewReady(true);
      setStatus(`Preview sẵn sàng (~${d.toFixed(0)}s) · Bấm Phát hoặc Xuất & Tải`);
    } catch (e: any) {
      setError(e?.message || "Lỗi load preview");
      setStatus("Thất bại");
    }
  };

  const playPreview = async () => {
    if (!previewReady) return;
    const video = bgVideoRef.current!;
    const audio = audioRef.current!;
    try {
      await video.play();
      await audio.play();
      setStatus("Đang phát preview...");
    } catch (e: any) {
      setError(e?.message || "Không phát được");
    }
  };

  const stopPreview = () => {
    bgVideoRef.current?.pause();
    audioRef.current?.pause();
    setStatus("Đã dừng preview");
  };

  const drawFrame = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number
  ) => {
    // cover scale like object-fit: cover
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(video, dx, dy, dw, dh);

    // text overlay
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const title = (songTitle || "").slice(0, 80);
    const sub = (artist || "").slice(0, 80);

    ctx.font = "bold 40px system-ui, Segoe UI, sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.fillStyle = "#fff";
    ctx.strokeText(title, w / 2, h * 0.4);
    ctx.fillText(title, w / 2, h * 0.4);

    ctx.font = "600 24px system-ui, Segoe UI, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeText(sub, w / 2, h * 0.48);
    ctx.fillText(sub, w / 2, h * 0.48);
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
    setStatus("Đang xuất video (ghi màn hình preview)...");

    const video = bgVideoRef.current;
    const audio = audioRef.current;
    const canvas = canvasRef.current!;
    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const total = Math.min(duration, 120);
    // Reset playheads
    audio.currentTime = 0;
    // keep random bg offset already set, or restart relative
    const bgStart = video.currentTime;

    try {
      // Video stream from canvas
      const canvasStream = canvas.captureStream(30);

      // Audio stream
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(dest);
      source.connect(audioCtx.destination); // also hear while recording

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
        videoBitsPerSecond: 4_000_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };

      const done = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(new Blob(chunksRef.current, { type: mime }));
        };
        recorder.onerror = () => reject(new Error("MediaRecorder error"));
      });

      recorder.start(200);

      await video.play();
      await audio.play();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const t0 = performance.now();
      const drawLoop = () => {
        drawFrame(ctx, video, W, H);
        const elapsed = (performance.now() - t0) / 1000;
        setProgress(Math.min(99, Math.round((elapsed / total) * 100)));
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

      // cleanup audio graph
      try {
        source.disconnect();
        await audioCtx.close();
      } catch {}

      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setProgress(100);
      setStatus("✅ Xuất xong — đang tải file...");

      // Auto download
      const a = document.createElement("a");
      a.href = url;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      a.download = `${(songTitle || "video").replace(/\s+/g, "_")}_720p.${ext}`;
      a.click();

      setStatus("✅ Đã tải file về máy");
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message ||
          "Xuất thất bại. Dùng Chrome/Edge mới nhất. Nếu nhạc từ link, thử upload file mp3."
      );
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
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Đăng thất bại");
      }
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff0050] to-[#00f2ea] flex items-center justify-center font-bold text-lg">
              OM
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Ontop Media Music</h1>
              <p className="text-xs text-gray-400">
                Preview trình duyệt • Xuất & tải nhanh • Không FFmpeg
              </p>
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
                <label className="block text-sm text-gray-400 mb-1">Tác giả / Remix</label>
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
            <h2 className="text-lg font-semibold mb-4">Preview (Landscape 720p)</h2>
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-[#333]">
              <video
                ref={bgVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
                loop
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
                <p
                  className="text-white text-center font-bold text-xl sm:text-2xl"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,.85)" }}
                >
                  {songTitle}
                </p>
                <p
                  className="text-white/95 text-center text-sm sm:text-base mt-2"
                  style={{ textShadow: "0 2px 6px rgba(0,0,0,.8)" }}
                >
                  {artist}
                </p>
              </div>
            </div>
            <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
            <canvas ref={canvasRef} className="hidden" />
            <p className="text-xs text-gray-500 mt-3 text-center">
              Xem trước ngay trên trình duyệt · Xuất bằng MediaRecorder (không render FFmpeg)
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
                <label className="block text-sm text-gray-400">Caption (đăng TikTok)</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#ff0050] resize-none"
                />
                <label className="block text-sm text-gray-400">
                  Cookie TikTok (<code className="text-pink-400">sessionid</code>)
                </label>
                <textarea
                  value={tiktokCookies}
                  onChange={(e) => setTiktokCookies(e.target.value)}
                  rows={2}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#ff0050] resize-none"
                  placeholder="sessionid=..."
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
        Ontop Media Music • Browser preview • MediaRecorder export • 1280×720
      </footer>
    </div>
  );
}
