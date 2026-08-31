"use client";

import { useState, useEffect } from "react";

const RENDER_API = "https://ontop-video-api.onrender.com";

async function fetchRetry(
  url: string,
  init?: RequestInit,
  tries = 4
): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 90000);
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      lastErr = e;
      // cold start / mạng — chờ rồi thử lại
      await new Promise((r) => setTimeout(r, 3000 + i * 2000));
    }
  }
  throw lastErr || new Error("Không kết nối được API");
}

export default function Home() {
  const [songTitle, setSongTitle] = useState("MASHUP HOT TIKTOK - QUINVY REMIX");
  const [artist, setArtist] = useState("OCEAN MUSIC");
  const [musicUrl, setMusicUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Nhập link hoặc upload → Tạo video");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [durationHint, setDurationHint] = useState(30);

  useEffect(() => {
    if (!musicUrl.trim() && !musicFile) return;
    const a = new Audio();
    const src = musicFile ? URL.createObjectURL(musicFile) : musicUrl.trim();
    a.src = src;
    a.onloadedmetadata = () => {
      if (isFinite(a.duration) && a.duration > 1) {
        setDurationHint(Math.min(a.duration, 300));
      }
      if (musicFile) URL.revokeObjectURL(src);
    };
  }, [musicUrl, musicFile]);

  // Đánh thức API khi mở trang
  useEffect(() => {
    fetchRetry(`${RENDER_API}/health`, { cache: "no-store" }, 2).catch(() => {});
  }, []);

  const createVideo = async () => {
    setError(null);
    setOutputUrl(null);
    setProjectId(null);
    setProgress(0);
    setIsWorking(true);

    try {
      setStatus("Đang đánh thức API (có thể 30–60s lần đầu)...");
      setProgress(5);
      const healthRes = await fetchRetry(
        `${RENDER_API}/health`,
        { cache: "no-store" },
        5
      );
      const health = await healthRes.json().catch(() => ({}));
      if (!health.ok) {
        throw new Error("API chưa sẵn sàng. Đợi 20s rồi thử lại.");
      }

      setStatus("Gửi job render...");
      setProgress(15);

      let createRes: Response;
      const hasFiles = !!(bgFile || musicFile);

      if (hasFiles) {
        const fd = new FormData();
        if (bgFile) fd.append("video", bgFile);
        if (musicFile) fd.append("music", musicFile);
        if (videoUrl.trim()) fd.append("video_url", videoUrl.trim());
        if (musicUrl.trim()) fd.append("music_url", musicUrl.trim());
        fd.append("song_title", songTitle);
        fd.append("artist", artist);
        fd.append("logo_url", `${window.location.origin}/logo.png`);
        fd.append("duration_sec", String(durationHint));
        // Upload thẳng Render — tránh limit body Vercel 4.5MB
        createRes = await fetchRetry(`${RENDER_API}/v1/render-form`, {
          method: "POST",
          body: fd,
        });
      } else {
        if (!videoUrl.trim() || !musicUrl.trim()) {
          throw new Error("Cần video nền + nhạc (link hoặc upload file).");
        }
        createRes = await fetchRetry(`${RENDER_API}/v1/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_url: videoUrl.trim(),
            music_url: musicUrl.trim(),
            song_title: songTitle,
            artist,
            logo_url: `${window.location.origin}/logo.png`,
            duration_sec: durationHint,
            width: 1280,
            height: 720,
            fps: 50,
          }),
        });
      }

      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !(createData.job_id || createData.project)) {
        throw new Error(
          createData.error ||
            createData.detail ||
            createData.message ||
            `Tạo job thất bại (HTTP ${createRes.status})`
        );
      }

      const jobId = (createData.job_id || createData.project) as string;
      setProjectId(jobId);
      setStatus(`Đang render… ${jobId}`);
      setProgress(25);

      const started = Date.now();
      const maxWait = 15 * 60 * 1000;
      while (Date.now() - started < maxWait) {
        await new Promise((r) => setTimeout(r, 4000));
        let stRes: Response;
        try {
          stRes = await fetchRetry(
            `${RENDER_API}/v1/status/${encodeURIComponent(jobId)}`,
            { cache: "no-store" },
            3
          );
        } catch {
          // fallback proxy
          stRes = await fetch(
            `/api/video/status?id=${encodeURIComponent(jobId)}`,
            { cache: "no-store" }
          );
        }
        const stData = await stRes.json().catch(() => ({}));
        if (!stRes.ok) {
          throw new Error(
            stData.error || stData.detail || `Status HTTP ${stRes.status}`
          );
        }
        const movie = stData.movie || stData;
        const st = movie.status as string;
        const pct = typeof movie.progress === "number" ? movie.progress : 0;
        setProgress(Math.min(95, Math.max(25, pct)));
        setStatus(
          `Render: ${st}${movie.message ? " — " + movie.message : ""}`
        );

        if (st === "done") {
          const url = `${RENDER_API}/v1/download/${jobId}`;
          setOutputUrl(url);
          setProgress(100);
          setStatus(
            `✅ Xong · ${
              movie.duration ? Math.round(movie.duration) + "s · " : ""
            }${movie.size ? (movie.size / 1024 / 1024).toFixed(1) + "MB" : ""}`
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(songTitle || "video")
            .replace(/\s+/g, "_")
            .slice(0, 40)}_720p50.mp4`;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          a.remove();
          return;
        }
        if (st === "error") {
          throw new Error(movie.message || "Render error");
        }
      }
      throw new Error("Hết thời gian chờ render (15 phút).");
    } catch (e: any) {
      console.error(e);
      let msg = e?.message || "Lỗi không rõ";
      if (e?.name === "AbortError") {
        msg =
          "Timeout khi gọi API. API free đang cold start — chờ 1 phút rồi bấm lại.";
      } else if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        msg =
          "Trình duyệt không tới được API Render. Kiểm tra mạng / tắt chặn quảng cáo, chờ 30s rồi thử lại.";
      }
      setError(msg);
      setStatus("Thất bại");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#262626] bg-[#111] sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="Ontop"
              className="h-9 w-auto object-contain"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">Ontop Media Music</h1>
              <p className="text-xs text-gray-400 truncate">
                Free API · FFmpeg · 720p50
              </p>
            </div>
          </div>
          <div className="text-sm text-emerald-400 shrink-0">Free</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">1. Thông tin nhạc</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tên bài</label>
            <input
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Tác giả / Label
            </label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Nhạc — link hoặc upload
            </label>
            <input
              value={musicUrl}
              onChange={(e) => {
                setMusicUrl(e.target.value);
                setMusicFile(null);
              }}
              placeholder="https://...mp3"
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 mb-2 focus:outline-none focus:border-[#ff0050]"
            />
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setMusicFile(f);
                if (f) setMusicUrl("");
              }}
              className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ff0050] file:text-white"
            />
            {musicFile && (
              <p className="text-xs text-green-400 mt-1">
                ✓ {musicFile.name} (
                {(musicFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        </section>

        <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">2. Video nền</h2>
          <input
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setBgFile(null);
            }}
            placeholder="https://...mp4"
            className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 mb-2 focus:outline-none focus:border-[#00f2ea]"
          />
          <input
            type="file"
            accept="video/*,.mp4,.webm,.mov"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setBgFile(f);
              if (f) setVideoUrl("");
            }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00f2ea] file:text-black file:font-medium"
          />
          {bgFile && (
            <p className="text-xs text-green-400">
              ✓ {bgFile.name} ({(bgFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
          <p className="text-xs text-gray-500">
            ~{Math.round(durationHint)}s · max ~5 phút
          </p>
        </section>

        <button
          onClick={createVideo}
          disabled={isWorking}
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-[#ff0050] to-[#00f2ea] disabled:opacity-50 text-lg"
        >
          {isWorking ? `Đang xử lý… ${progress}%` : "Tạo video"}
        </button>

        {isWorking && (
          <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#ff0050] to-[#00f2ea] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="text-sm text-center text-gray-400 bg-[#141414] border border-[#262626] rounded-xl px-4 py-3">
          {status}
          {projectId && (
            <div className="text-xs text-gray-600 mt-1">Job: {projectId}</div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl px-4 py-3 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {outputUrl && (
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold">Video đã render</h2>
            <video
              src={outputUrl}
              controls
              playsInline
              className="w-full rounded-xl bg-black max-h-96"
            />
            <a
              href={outputUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center py-3 rounded-xl bg-[#ff0050] font-medium"
            >
              Tải MP4
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
