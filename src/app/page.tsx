"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const BG_VIDEOS = [
  "https://v16-notes.tiktokcdn-us.com/3200ca84d2fcf263b4114058d416e776/6a8e09c9/video/tos/alisg/tos-alisg-pve-0037/o4hCRCWSBEhNyh7HAUiau7KHbAfB15AIiCwKBM/?a=0&bti=OUBzOTg7QGo6OjZAL3AjLTAzYCMxNDNg&&bt=1588&ft=asKJYqUHm~-PD12w1XyI3wUtvObhMeF~O5&mime_type=video_mp4&rc=aTc0OWZpZGYzNDZmM2c0aEBpM3U8NXU5cjY3PDMzODgzNEA2NGEuNWEwXzMxLy1jNTQzYSNtNWQ2MmRzNGRhLS1kL2Bzcw%3D%3D&vvpl=1&l=20260825143156342DBB31C9BAB2112EF4&btag=e000e8000",
  "https://v16-notes.tiktokcdn-us.com/aafb21a2d0aa38dfb6e04e9c31262c20/6a8e0a20/video/tos/alisg/tos-alisg-pve-0037c001/owvgMGUQA17ERhcpRnIBBvrafEIuQwFq2LDdfD/?a=0&bti=OUBzOTg7QGo6OjZAL3AjLTAzYCMxNDNg&&bt=1169&ft=4fLr5MX_8Zmo06~cHa4jVv3JYdWrKsd.&mime_type=video_mp4&rc=Z2RnOzVlOzw6PDdpZjs1aEBpMzZxPGo5cm5rODMzODczNEBfYzReLmAyNTExXzZfNi1gYSMvY2ZxMmQ0cW5hLS1kMWBzcw%3D%3D&vvpl=1&l=20260825143320E56CA200A5429E101089&btag=e000a8000",
  "https://v16-notes.tiktokcdn-us.com/c1400c575ecc908316dfe25e1762857a/6a8dfff2/video/tos/alisg/tos-alisg-pve-0037c001/oQAiVsMo0rBIhB9HiSTF7acAoLEYFKEPDAx3U/?a=0&bti=OUBzOTg7QGo6OjZAL3AjLTAzYCMxNDNg&&bt=1205&ft=7SkatDDwNj6VQQdGntpisdOaaVZqYl59yo4~hWLrK&mime_type=video_mp4&rc=aTw1ZWg3NzY7ZzQzNDo8NEBpM3VvdHc5cjs3OzMzODczNEA1YC8xLmI0Xy4xYWI0M18vYSMzNmwwMmQ0a2JhLS1kMTFzcw%3D%3D&vvpl=1&l=202608251436065F9F0E29EAACBB103D8F&btag=e000e8000",
  "https://v16-notes.tiktokcdn-us.com/ad159788b9bff3ce14a8613481e839b8/6a8ec124/video/tos/useast2a/tos-useast2a-ve-68c810-euttp/o8HE14iWQszCkO8B9hXDfFiVskAFuxHgxfBpIV/?a=0&bti=OTg7QGo5QHM6OjZALTAzYCMvcCMxNDNg&&bt=1115&ft=kurKSyt4ZZo0PD-a9B3aQ9ZifKA6JE.C~&mime_type=video_mp4&rc=ZzZnOWQ0aTQ7ZmRmMztkaEBpanhlNXM5cjw6OjMzbzgzNUAwMmAwMV5fNl4xLzUxNC9iYSNsL2tvMmQ0amxhLS1kLzFzcw%3D%3D&vvpl=1&l=2026082603362015474D37856B4715552E&btag=e000a8000",
];

// Proxy helper to bypass CORS
const proxyUrl = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

export default function Home() {
  const [songTitle, setSongTitle] = useState("Phía Sau Một Cô Gái");
  const [artist, setArtist] = useState("Đại Ngố Remix - NTP Vinahouse");
  const [musicUrl, setMusicUrl] = useState(
    "https://v16-ies-music.tiktokcdn-us.com/76e9f54690a84e94262f90370273c74e/6a97b47f/video/tos/alisg/tos-alisg-v-27dcd7/oQasj1eUJYmCaQtfjUQclLDqzhaFEBPRBgoDIj/?a=583965&bti=OUBzOTg7QGo6OjZAL3AjLTAzYCMxNDNg&&bt=125&ft=B7czJVY1wbqRft9EOr_hFJ4_A0pi-Q8CQjKJvvTJH.0P3-I&mime_type=audio_mpeg&rc=Mzc6aTVkNjo3NzhoZjo1aUBpamtxbms5cm1rZDMzODU8NEBiMDJgLzUtNS0xMGJeLjNfYSNqYGhtMmRzLjNhLS1kMS1zcw%3D%3D&vvpl=1&l=202608260528416B7B35F3DB090719B683&btag=e000c8000&shp=d05b14bd&shcp=-"
  );
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on("log", ({ message }) => {
          console.log("[ffmpeg]", message);
        });
        ffmpeg.on("progress", ({ progress }) => {
          setProgress(Math.round(progress * 100));
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

  const handleGenerate = async () => {
    if (!ffmpegLoaded || !ffmpegRef.current) {
      setError("FFmpeg chưa sẵn sàng");
      return;
    }
    if (!musicUrl && !musicFile) {
      setError("Vui lòng nhập link nhạc hoặc upload file");
      return;
    }

    setIsLoading(true);
    setError(null);
    setOutputUrl(null);
    setThumbnailUrl(null);
    setProgress(0);
    setStatus("Đang chuẩn bị...");

    const ffmpeg = ffmpegRef.current;

    try {
      // ===== 1. MUSIC =====
      setStatus("Đang tải nhạc (qua proxy)...");
      let musicData: Uint8Array;
      if (musicFile) {
        musicData = await fetchFile(musicFile);
      } else {
        const res = await fetch(proxyUrl(musicUrl));
        if (!res.ok) throw new Error(`Không tải được nhạc: ${res.status}`);
        const blob = await res.blob();
        musicData = await fetchFile(blob);
      }
      await ffmpeg.writeFile("music.mp3", musicData);

      // Duration via Audio element
      setStatus("Đang phân tích độ dài nhạc...");
      let duration = 30;
      try {
        const audio = new Audio();
        if (musicFile) {
          audio.src = URL.createObjectURL(musicFile);
        } else {
          // Use proxy for metadata too
          audio.src = proxyUrl(musicUrl);
        }
        await new Promise((resolve, reject) => {
          audio.onloadedmetadata = () => {
            duration = audio.duration;
            resolve(null);
          };
          audio.onerror = () => reject(new Error("Audio metadata fail"));
          setTimeout(() => reject(new Error("timeout")), 15000);
        });
      } catch (e) {
        console.warn("Duration fallback", e);
        duration = 45;
      }
      if (!isFinite(duration) || duration < 5) duration = 30;
      setStatus(`Độ dài nhạc: ${duration.toFixed(1)} giây`);

      // ===== 2. BACKGROUND VIDEO (via proxy) =====
      const bgUrl = BG_VIDEOS[Math.floor(Math.random() * BG_VIDEOS.length)];
      setStatus("Đang tải video nền qua proxy (bắt buộc CORS)...");

      const bgRes = await fetch(proxyUrl(bgUrl));
      if (!bgRes.ok) {
        throw new Error(`Không tải được video nền: ${bgRes.status}. Proxy có thể bị giới hạn kích thước.`);
      }
      const bgBlob = await bgRes.blob();
      const bgData = await fetchFile(bgBlob);
      await ffmpeg.writeFile("bg.mp4", bgData);

      // Random start (safe range for long videos)
      const startTime = Math.floor(Math.random() * 45);

      setStatus("Đang render video ngang (1920x1080) + mute nền + nhạc + text...");

      // Escape text for drawtext
      const titleEsc = songTitle
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "")
        .replace(/"/g, "")
        .replace(/%/g, "");
      const artistEsc = artist
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "")
        .replace(/"/g, "")
        .replace(/%/g, "");

      // Landscape 1920x1080 - style giống video mẫu (nằm ngang)
      await ffmpeg.exec([
        "-ss", String(startTime),
        "-t", String(duration),
        "-i", "bg.mp4",
        "-i", "music.mp3",
        "-filter_complex",
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,` +
        `drawtext=text='${titleEsc}':fontcolor=white:fontsize=56:borderw=4:bordercolor=black@0.8:x=(w-text_w)/2:y=h*0.38,` +
        `drawtext=text='${artistEsc}':fontcolor=white:fontsize=32:borderw=3:bordercolor=black@0.7:x=(w-text_w)/2:y=h*0.48[v]`,
        "-map", "[v]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "26",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-shortest",
        "-movflags", "+faststart",
        "-y",
        "output.mp4",
      ]);

      setStatus("Đang tạo thumbnail...");
      await ffmpeg.exec([
        "-i", "output.mp4",
        "-ss", "1.5",
        "-vframes", "1",
        "-q:v", "2",
        "-y",
        "thumb.jpg",
      ]);

      const outputData = await ffmpeg.readFile("output.mp4");
      const thumbData = await ffmpeg.readFile("thumb.jpg");

      const videoBlob = new Blob([outputData as BlobPart], { type: "video/mp4" });
      const thumbBlob = new Blob([thumbData as BlobPart], { type: "image/jpeg" });

      setOutputUrl(URL.createObjectURL(videoBlob));
      setThumbnailUrl(URL.createObjectURL(thumbBlob));
      setStatus("✅ Hoàn thành! Video nằm ngang (1920x1080) đã sẵn sàng.");
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Lỗi khi tạo video.");
      setStatus("Thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadVideo = () => {
    if (!outputUrl) return;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${songTitle.replace(/\s+/g, "_")}_vinahouse_landscape.mp4`;
    a.click();
  };

  const copyCaption = () => {
    navigator.clipboard.writeText(caption);
    setStatus("Đã copy caption!");
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
              <p className="text-xs text-gray-400">Auto Video Generator • Vinahouse Style • Landscape</p>
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
          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#ff0050] text-xs flex items-center justify-center">1</span>
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
                <label className="block text-sm text-gray-400 mb-1">Link nhạc (hoặc upload file)</label>
                <input
                  type="text"
                  value={musicUrl}
                  onChange={(e) => {
                    setMusicUrl(e.target.value);
                    setMusicFile(null);
                  }}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050] transition mb-2"
                  placeholder="https://...mp3"
                />
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setMusicFile(f);
                      setMusicUrl("");
                    }
                  }}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ff0050] file:text-white file:cursor-pointer"
                />
              </div>
            </div>
          </section>

          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#ff0050] text-xs flex items-center justify-center">2</span>
              Video nền (Nằm ngang 1920×1080)
            </h2>
            <p className="text-sm text-gray-400 mb-3">
              Hệ thống dùng <strong>proxy server</strong> để vượt CORS, chọn ngẫu nhiên 1 trong 4 video đêm mưa, cắt đoạn ngẫu nhiên có độ dài = nhạc, mute tiếng gốc.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {BG_VIDEOS.map((_, i) => (
                <div key={i} className="aspect-video bg-[#0a0a0a] border border-[#333] rounded-lg flex items-center justify-center text-xs text-gray-500">
                  BG #{i + 1} • Landscape
                </div>
              ))}
            </div>
          </section>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !ffmpegLoaded}
            className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-[#ff0050] to-[#00f2ea] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang tạo... {progress}%
              </>
            ) : (
              "Tạo Video Nằm Ngang Ngay"
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
              </div>
            ) : (
              <div className="aspect-video max-h-[360px] bg-[#0a0a0a] rounded-xl border border-dashed border-[#333] flex items-center justify-center text-gray-500">
                Video nằm ngang sẽ hiện ở đây
              </div>
            )}
          </section>

          <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#ff0050] text-xs flex items-center justify-center">3</span>
              Caption & Hashtag (TikTok)
            </h2>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff0050] transition resize-none text-sm"
            />
            <button
              onClick={copyCaption}
              className="mt-3 w-full py-2.5 rounded-xl bg-[#262626] hover:bg-[#333] text-sm font-medium transition"
            >
              Copy Caption
            </button>
            <p className="mt-3 text-xs text-gray-500">
              * Auto-post TikTok bằng cookie không ổn định trên Vercel. Khuyến nghị tải video + copy caption rồi đăng thủ công.
            </p>
          </section>

          {thumbnailUrl && (
            <section className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-3">Thumbnail</h2>
              <img src={thumbnailUrl} alt="Thumbnail" className="w-full rounded-xl max-h-48 object-cover" />
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-[#262626] mt-12 py-6 text-center text-sm text-gray-500">
        Ontop Media Music • Landscape 1920×1080 • CORS Proxy enabled • Vercel
      </footer>
    </div>
  );
}
