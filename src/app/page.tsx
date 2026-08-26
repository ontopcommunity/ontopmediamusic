"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const proxyUrl = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

export default function Home() {
  const [songTitle, setSongTitle] = useState("Phía Sau Một Cô Gái");
  const [artist, setArtist] = useState("Đại Ngố Remix - NTP Vinahouse");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiktokCookies, setTiktokCookies] = useState("");
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on("log", ({ message }) => {
          console.log("[ffmpeg]", message);
        });
        ffmpeg.on("progress", ({ progress: p }) => {
          setProgress(Math.min(99, Math.round(p * 100)));
        });

        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        setFfmpegLoaded(true);
        setStatus("FFmpeg sẵn sàng");
      } catch (e) {
        console.error(e);
        setError("Không load được FFmpeg. Hãy thử refresh trang.");
      }
    };
    load();
  }, []);

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

  const getAudioDuration = (src: string | File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      const objectUrl = typeof src === "string" ? src : URL.createObjectURL(src);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        if (typeof src !== "string") URL.revokeObjectURL(objectUrl);
        resolve(isFinite(d) && d > 0 ? d : 30);
      };
      audio.onerror = () => {
        if (typeof src !== "string") URL.revokeObjectURL(objectUrl);
        resolve(30);
      };
      setTimeout(() => {
        if (typeof src !== "string") URL.revokeObjectURL(objectUrl);
        resolve(30);
      }, 12000);
      audio.src = objectUrl;
    });
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const d = video.duration;
        URL.revokeObjectURL(objectUrl);
        resolve(isFinite(d) && d > 0 ? d : 60);
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(60);
      };
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        resolve(60);
      }, 12000);
      video.src = objectUrl;
    });
  };

  const handleGenerate = async () => {
    if (!ffmpegLoaded || !ffmpegRef.current) {
      setError("FFmpeg chưa sẵn sàng");
      return;
    }
    if (!bgFile) {
      setError("Vui lòng upload video nền");
      return;
    }
    if (!musicUrl && !musicFile) {
      setError("Vui lòng nhập link nhạc hoặc upload file nhạc");
      return;
    }

    setIsLoading(true);
    setError(null);
    setOutputUrl(null);
    setThumbnailUrl(null);
    setProgress(0);
    setStatus("Đang chuẩn bị...");

    const ffmpeg = ffmpegRef.current;

    const safeDelete = async (name: string) => {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }
    };

    try {
      await safeDelete("bg.mp4");
      await safeDelete("music.mp3");
      await safeDelete("output.mp4");
      await safeDelete("thumb.jpg");
      await safeDelete("font.ttf");

      // ===== MUSIC =====
      setStatus("Đang tải nhạc...");
      let musicData: Uint8Array;
      let duration = 30;

      if (musicFile) {
        musicData = await fetchFile(musicFile);
        duration = await getAudioDuration(musicFile);
      } else {
        const res = await fetch(proxyUrl(musicUrl));
        if (!res.ok) {
          throw new Error(
            `Không tải được nhạc từ link (HTTP ${res.status}). Thử upload file nhạc mp3.`
          );
        }
        const blob = await res.blob();
        if (blob.size < 1000) {
          throw new Error("File nhạc tải về quá nhỏ / không hợp lệ. Kiểm tra link hoặc upload file.");
        }
        musicData = await fetchFile(blob);
        duration = await getAudioDuration(proxyUrl(musicUrl));
      }

      if (!isFinite(duration) || duration < 3) duration = 30;
      if (duration > 120) {
        duration = 120;
        setStatus("Nhạc dài >120s — cắt còn 120s để render siêu nhanh...");
      } else {
        setStatus(`Độ dài nhạc: ${duration.toFixed(1)}s — render 720p nhanh...`);
      }

      await ffmpeg.writeFile("music.mp3", musicData);

      // ===== BACKGROUND =====
      if (bgFile.size > 80 * 1024 * 1024) {
        throw new Error(
          `Video nền ${(bgFile.size / 1024 / 1024).toFixed(1)}MB quá lớn. Hãy dùng file < 50–80MB.`
        );
      }
      const bgData = await fetchFile(bgFile);
      await ffmpeg.writeFile("bg.mp4", bgData);

      const bgDuration = await getVideoDuration(bgFile);
      const maxStart = Math.max(0, bgDuration - duration - 0.5);
      const startTime = maxStart > 1 ? Math.random() * maxStart : 0;

      // ===== FONT for drawtext (required by ffmpeg.wasm) =====
      setStatus("Đang tải font chữ...");
      let hasFont = false;
      try {
        const fontUrls = [
          "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
          "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
        ];
        let fontBin: Uint8Array | null = null;
        for (const fu of fontUrls) {
          try {
            const fr = await fetch(fu);
            if (fr.ok) {
              fontBin = await fetchFile(await fr.blob());
              break;
            }
          } catch {
            /* try next */
          }
        }
        if (fontBin && fontBin.length > 1000) {
          await ffmpeg.writeFile("font.ttf", fontBin);
          hasFont = true;
        }
      } catch (fe) {
        console.warn("Font load failed", fe);
      }

      // Escape for drawtext
      const esc = (s: string) =>
        s
          .replace(/\\/g, "\\\\")
          .replace(/:/g, "\\:")
          .replace(/'/g, "")
          .replace(/"/g, "")
          .replace(/%/g, "")
          .replace(/\n/g, " ")
          .slice(0, 80);
      const titleEsc = esc(songTitle || "Untitled");
      const artistEsc = esc(artist || "");

      setStatus(
        `Render nhanh 1280×720 (nền ~${startTime.toFixed(1)}s, dài ${duration.toFixed(1)}s)...`
      );

      const runEncode = async (withText: boolean) => {
        const vfBase =
          "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=30";
        let filter: string;
        if (withText && hasFont) {
          filter =
            vfBase +
            `,drawtext=fontfile=/font.ttf:text='${titleEsc}':fontcolor=white:fontsize=40:borderw=3:bordercolor=black@0.8:x=(w-text_w)/2:y=h*0.38` +
            `,drawtext=fontfile=/font.ttf:text='${artistEsc}':fontcolor=white:fontsize=22:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=h*0.48[v]`;
        } else {
          filter = vfBase + "[v]";
        }

        await ffmpeg.exec([
          "-ss",
          String(startTime),
          "-t",
          String(duration),
          "-i",
          "bg.mp4",
          "-i",
          "music.mp3",
          "-filter_complex",
          filter,
          "-map",
          "[v]",
          "-map",
          "1:a?",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "fastdecode",
          "-crf",
          "32",
          "-pix_fmt",
          "yuv420p",
          "-threads",
          "0",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-shortest",
          "-movflags",
          "+faststart",
          "-y",
          "output.mp4",
        ]);
      };

      try {
        await runEncode(true);
      } catch (e1: any) {
        console.warn("Encode with text failed, retry without text", e1);
        setStatus("Render không dùng text overlay (fallback)...");
        await safeDelete("output.mp4");
        await runEncode(false);
      }

      setStatus("Đang tạo thumbnail...");
      try {
        await ffmpeg.exec([
          "-i",
          "output.mp4",
          "-ss",
          "0.5",
          "-vframes",
          "1",
          "-q:v",
          "3",
          "-y",
          "thumb.jpg",
        ]);
        const thumbData = await ffmpeg.readFile("thumb.jpg");
        setThumbnailUrl(
          URL.createObjectURL(new Blob([thumbData as BlobPart], { type: "image/jpeg" }))
        );
      } catch {
        console.warn("thumbnail failed");
      }

      const outputData = await ffmpeg.readFile("output.mp4");
      const videoBlob = new Blob([outputData as BlobPart], { type: "video/mp4" });
      if (videoBlob.size < 1000) {
        throw new Error("Output video rỗng — codec đầu vào có thể không hỗ trợ. Thử convert nền sang mp4 H.264.");
      }

      setOutputUrl(URL.createObjectURL(videoBlob));
      setStatus("✅ Hoàn thành! Video 720p ngang (1280×720) — render nhanh.");
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.toString?.() ||
        "Lỗi không xác định khi tạo video";
      setError(
        msg.length > 300
          ? msg.slice(0, 300) + "…"
          : msg + " | Thử file mp4/mp3 nhỏ hơn, hoặc tắt extension chặn CDN."
      );
      setStatus("Thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const postToTikTok = async () => {
    if (!outputUrl) {
      setPostResult("Chưa có video để đăng");
      return;
    }
    if (!tiktokCookies.trim() && !confirm("Chưa nhập cookie. Vẫn thử dùng TIKTOK_COOKIES trên server?")) {
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
      form.append("video", videoBlob, "video.mp4");
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
        const hints = (data.hints || []).join(" | ");
        throw new Error(
          (data.error || "Đăng thất bại") + (hints ? " — " + hints : "") +
          (data.debug?.lastDetail ? " | debug: " + data.debug.lastDetail : "")
        );
      }
      setPostResult("✅ " + (data.message || "Đã đăng TikTok") + (data.itemId ? ` (id: ${data.itemId})` : ""));
    } catch (e: any) {
      setPostResult("❌ " + (e.message || "Lỗi đăng TikTok"));
    } finally {
      setPosting(false);
    }
  };

  const downloadVideo = () => {
    if (!outputUrl) return;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${songTitle.replace(/\s+/g, "_")}_vinahouse_landscape.mp4`;
    a.click();
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
                Auto Video Generator • Upload nền + nhạc • Landscape
              </p>
            </div>
          </div>
          <div className="text-sm text-gray-400">
            {ffmpegLoaded ? (
              <span className="text-green-400">● FFmpeg Ready</span>
            ) : (
              <span className="text-yellow-400">○ Đang load FFmpeg...</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          {/* 1. Song info */}
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
                  placeholder="Phía Sau Một Cô Gái"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tác giả / Remix</label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050] transition"
                  placeholder="Đại Ngố Remix - NTP Vinahouse"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Nhạc: link trực tiếp hoặc upload file
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
                  placeholder="https://...mp3 (link trực tiếp)"
                />
                <input
                  ref={musicInputRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac"
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
                    ✓ File nhạc: {musicFile.name} ({(musicFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 2. Background video upload */}
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#ff0050] text-xs flex items-center justify-center">
                2
              </span>
              Video nền (upload từ máy)
            </h2>
            <p className="text-sm text-gray-400 mb-3">
              Upload video nền. Hệ thống cắt đoạn ngẫu nhiên có độ dài = nhạc, mute tiếng gốc, xuất{" "}
              <strong>1280×720 (720p ngang)</strong> — render tối ưu tốc độ.
            </p>
            <input
              ref={bgInputRef}
              type="file"
              accept="video/*,.mp4,.webm,.mov"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setBgFile(f);
              }}
              className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#00f2ea] file:text-black file:font-medium file:cursor-pointer"
            />
            {bgFile && (
              <p className="text-xs text-green-400 mt-2">
                ✓ Video nền: {bgFile.name} ({(bgFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <p className="text-xs text-gray-600 mt-2">
              Khuyên dùng mp4, dưới ~50–80MB để render nhanh trên trình duyệt.
            </p>
          </section>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !ffmpegLoaded}
            className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-[#ff0050] to-[#00f2ea] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Đang tạo... {progress}%
              </>
            ) : (
              "Tạo Video Nằm Ngang"
            )}
          </button>

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
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Preview Video (Landscape)</h2>
            {outputUrl ? (
              <div className="space-y-4">
                <video
                  src={outputUrl}
                  controls
                  className="w-full rounded-xl bg-black aspect-video max-h-[360px] object-contain mx-auto"
                />
                <div className="flex gap-3">
                  <button
                    onClick={downloadVideo}
                    className="flex-1 py-3 rounded-xl bg-[#ff0050] hover:bg-[#e6004a] font-medium transition"
                  >
                    Tải Video
                  </button>
                  {thumbnailUrl && (
                    <a
                      href={thumbnailUrl}
                      download="thumbnail.jpg"
                      className="flex-1 py-3 rounded-xl bg-[#262626] hover:bg-[#333] font-medium transition text-center"
                    >
                      Tải Thumbnail
                    </a>
                  )}
                </div>

                <div className="mt-4 space-y-2 border-t border-[#333] pt-4">
                  <label className="block text-sm text-gray-400">Caption auto (khi đăng TikTok)</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={3}
                    className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#ff0050] resize-none"
                  />
                  <label className="block text-sm text-gray-400">
                    Cookie TikTok (bắt buộc có <code className="text-pink-400">sessionid</code>)
                  </label>
                  <textarea
                    value={tiktokCookies}
                    onChange={(e) => setTiktokCookies(e.target.value)}
                    rows={3}
                    placeholder="sessionid=...; msToken=...; tt-target-idc=..."
                    className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#ff0050] resize-none"
                  />
                  <button
                    onClick={postToTikTok}
                    disabled={posting}
                    className="w-full py-3 rounded-xl bg-[#00f2ea] text-black font-semibold hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {posting ? "Đang đăng TikTok..." : "Đăng lên TikTok (caption + video)"}
                  </button>
                  {postResult && (
                    <p className="text-xs text-gray-300 break-words whitespace-pre-wrap">{postResult}</p>
                  )}
                  <p className="text-[11px] text-gray-600">
                    Unofficial API — cookie hết hạn phải lấy lại. Video nên &lt;15–20MB. Thumbnail dùng frame từ video khi đăng trên app/web TikTok.
                  </p>
                </div>
              </div>
            ) : (
              <div className="aspect-video max-h-[360px] bg-[#0a0a0a] rounded-xl border border-dashed border-[#333] flex items-center justify-center text-gray-500">
                Video nằm ngang sẽ hiện ở đây
              </div>
            )}
          </section>

          

          {thumbnailUrl && (
            <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-3">Thumbnail</h2>
              <img
                src={thumbnailUrl}
                alt="Thumbnail"
                className="w-full rounded-xl max-h-48 object-cover"
              />
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-[#262626] mt-12 py-6 text-center text-sm text-gray-500">
        Ontop Media Music • Upload nền + nhạc • 720p nhanh • FFmpeg.wasm
      </footer>
    </div>
  );
}
