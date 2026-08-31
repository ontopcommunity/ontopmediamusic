"use client";

import { useState, useRef, useEffect } from "react";

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

  const audioProbeRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Probe duration from music URL when possible
    if (!musicUrl.trim() && !musicFile) return;
    const a = new Audio();
    audioProbeRef.current = a;
    const src = musicFile ? URL.createObjectURL(musicFile) : musicUrl.trim();
    a.src = src;
    a.onloadedmetadata = () => {
      if (isFinite(a.duration) && a.duration > 1) {
        setDurationHint(Math.min(a.duration, 600));
      }
      if (musicFile) URL.revokeObjectURL(src);
    };
  }, [musicUrl, musicFile]);

  /** Upload file lên JSON2Video media qua presigned URL */
  const uploadToJ2V = async (file: File, folder: string) => {
    const init = await fetch("/api/json2video/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: (() => {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const dot = safe.lastIndexOf(".");
          const base = dot > 0 ? safe.slice(0, dot) : safe;
          const ext = dot > 0 ? safe.slice(dot) : "";
          return `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        })(),
        contentType: file.type || "application/octet-stream",
        size: file.size,
        folder,
      }),
    });
    const initData = await init.json();
    if (!init.ok || !initData.uploadUrl || !initData.fileUrl) {
      throw new Error(initData.error || "Không lấy được URL upload");
    }

    const put = await fetch(initData.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Upload file thất bại HTTP ${put.status}`);
    }
    return initData.fileUrl as string;
  };

  const createVideo = async () => {
    setError(null);
    setOutputUrl(null);
    setProjectId(null);
    setProgress(0);
    setIsWorking(true);

    try {
      let finalVideoUrl = videoUrl.trim();
      let finalMusicUrl = musicUrl.trim();

      if (bgFile) {
        setStatus("Đang upload video nền lên JSON2Video...");
        setProgress(8);
        finalVideoUrl = await uploadToJ2V(bgFile, "temp");
      }
      if (musicFile) {
        setStatus("Đang upload nhạc lên JSON2Video...");
        setProgress(16);
        finalMusicUrl = await uploadToJ2V(musicFile, "temp");
      }

      if (!finalVideoUrl || !finalMusicUrl) {
        throw new Error(
          "Cần video nền + nhạc (link công khai hoặc upload file)."
        );
      }

      setStatus("Gửi job render JSON2Video...");
      setProgress(25);

      const createRes = await fetch("/api/json2video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: finalVideoUrl,
          musicUrl: finalMusicUrl,
          songTitle,
          artist,
          durationSec: durationHint,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.project) {
        throw new Error(
          createData.error ||
            createData.detail?.message ||
            `Tạo job thất bại (${createRes.status})`
        );
      }

      const project = createData.project as string;
      setProjectId(project);
      setStatus(`Đang render trên JSON2Video… (${project})`);
      setProgress(35);

      // Poll đến khi xong
      const started = Date.now();
      const maxWait = 15 * 60 * 1000; // 15 phút
      while (Date.now() - started < maxWait) {
        await new Promise((r) => setTimeout(r, 4000));
        const stRes = await fetch(
          `/api/json2video/status?project=${encodeURIComponent(project)}`
        );
        const stData = await stRes.json();
        if (!stRes.ok) {
          throw new Error(stData.error || "Lỗi poll status");
        }
        const movie = stData.movie || stData;
        const st = movie.status as string;
        const pct = typeof movie.progress === "number" ? movie.progress : null;
        if (pct != null) {
          setProgress(35 + Math.round((pct / 100) * 60));
        } else {
          setProgress((p) => Math.min(90, p + 2));
        }
        setStatus(`Render: ${st}${pct != null ? ` ${pct}%` : ""}…`);

        if (st === "done" && movie.url) {
          setOutputUrl(movie.url);
          setProgress(100);
          setStatus(
            `✅ Xong · ${movie.duration ? Math.round(movie.duration) + "s · " : ""}${(
              (movie.size || 0) /
              1024 /
              1024
            ).toFixed(1)}MB`
          );
          // auto download
          const a = document.createElement("a");
          a.href = movie.url;
          a.download = `${(songTitle || "video").replace(/\s+/g, "_").slice(0, 40)}_720p50.mp4`;
          a.target = "_blank";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          return;
        }
        if (st === "error" || st === "timeout") {
          throw new Error(movie.message || `Render ${st}`);
        }
      }
      throw new Error("Hết thời gian chờ render (15 phút). Thử lại.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Lỗi không rõ");
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
            <img src="/logo.png" alt="Ontop" className="h-9 w-auto object-contain" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">Ontop Media Music</h1>
              <p className="text-xs text-gray-400 truncate">
                JSON2Video API · 720p · 50fps · nhạc gốc
              </p>
            </div>
          </div>
          <div className="text-sm text-cyan-400 shrink-0">Cloud Render</div>
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
            <label className="block text-sm text-gray-400 mb-1">Tác giả / Label</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Nhạc — link công khai hoặc upload file
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
                ✓ {musicFile.name} ({(musicFile.size / 1024 / 1024).toFixed(2)} MB)
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
            placeholder="https://...mp4 (link công khai)"
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
            Độ dài ước lượng: ~{Math.round(durationHint)}s (theo file nhạc)
          </p>
        </section>

        <button
          onClick={createVideo}
          disabled={isWorking}
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-[#ff0050] to-[#00f2ea] disabled:opacity-50 text-lg"
        >
          {isWorking ? `Đang xử lý… ${progress}%` : "Tạo video (JSON2Video)"}
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
            <div className="text-xs text-gray-600 mt-1">Project: {projectId}</div>
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
              onLoadedMetadata={(e) => {
                try {
                  e.currentTarget.playbackRate = 1;
                } catch {}
              }}
            />
            <a
              href={outputUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center py-3 rounded-xl bg-[#ff0050] font-medium"
            >
              Mở / Tải MP4
            </a>
          </section>
        )}

        <p className="text-xs text-gray-600 text-center leading-relaxed">
          Hệ thống dùng JSON2Video API: video nền muted + loop, nhạc gốc full chất lượng,
          logo góc trên-trái, thanh dọc + tên/tác giả góc dưới-trái (lệch phải nhẹ), xuất 720p · 50fps · MP4.
          Cần env <code className="text-pink-400">JSON2VIDEO_API_KEY</code> trên Vercel.
        </p>
      </main>
    </div>
  );
}
