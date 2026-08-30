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
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  /** scale = previewWidth / 1280 — đồng bộ mọi thiết bị */
  const [framePx, setFramePx] = useState({ w: 320, s: 320 / 1280 });
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

  // Đồng bộ kích thước overlay theo chiều rộng khung preview (mọi máy giống tỉ lệ 1280)
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth || 320;
      setFramePx({ w, s: w / 1280 });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
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
      try {
        video.playbackRate = 1;
      } catch {}
      await video.play().catch(() => {});
      video.pause();
      video.currentTime = 0;

      const audio = audioRef.current!;
      try {
        audio.playbackRate = 1;
      } catch {}
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
      setDuration(d); // full theo file nhạc, không cắt

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
    _progress = 0
  ) => {
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;

    // Cover base scale, rồi phóng to dần (1.0 → 1.18) + pan nhẹ
    // Không zoom/pan — giữ cover tĩnh để mượt tối đa như video nền
    const base = Math.max(w / vw, h / vh);
    const dw = vw * base;
    const dh = vh * base;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

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
      const logoW = Math.round(w * 0.20); // 256@1280 — khớp preview
      const logoH = Math.round((logo.naturalHeight / logo.naturalWidth) * logoW);
      const lx = Math.round(w * 0.032);
      const ly = Math.round(h * 0.04);
      ctx.drawImage(logo, lx, ly, logoW, logoH);
    }

    // Text nhỏ gọn bottom-left (tỉ lệ mẫu)
    const title = (songTitle || "").toUpperCase().slice(0, 90);
    const sub = (artist || "").toUpperCase().slice(0, 60);

    const leftPad = Math.round(w * 0.0376);
    // Thanh mỏng nhưng KÉO DÀI đủ 2 dòng chữ
    const barW = Math.max(2, Math.round(w * 0.002));
    const titleSize = Math.round(w * 0.024);
    const subSize = Math.round(w * 0.015);
    const textX = leftPad + barW + Math.round(w * 0.014);
    const baseY = h - Math.round(h * 0.075);

    const fontTitle = `300 ${titleSize}px "Be Vietnam Pro", "Segoe UI", sans-serif`;
    const fontSub = `500 ${subSize}px Inter, "Segoe UI", sans-serif`;

    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = fontTitle;
    const titleH = titleSize * 1.15;
    ctx.font = fontSub;
    const subH = subSize * 1.2;
    const gap = Math.round(h * 0.012);
    const blockH = titleH + gap + subH;
    // Thanh dài bằng khối chữ, hơi kéo thêm trên/dưới
    const extend = Math.round(h * 0.012);
    const barTop = baseY - blockH - extend;
    const barBottom = baseY + extend;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(leftPad, barTop, barW, barBottom - barTop);

    ctx.font = fontTitle;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillText(title, textX, baseY - subH - gap);

    ctx.font = fontSub;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
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
    if (typeof MediaRecorder === "undefined") {
      setError("Trình duyệt không hỗ trợ ghi video. Dùng Chrome.");
      return;
    }

    setIsRecording(true);
    setError(null);
    setOutputUrl(null);
    setProgress(0);
    setStatus("Ghi hình (tắt tiếng) → ghép nhạc gốc...");

    const video = bgVideoRef.current;
    const audio = audioRef.current;
    const canvas = canvasRef.current!;
    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

    const total = Math.max(
      3,
      duration || (isFinite(audio.duration) ? audio.duration : 30)
    );

    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const devMem = (navigator as any).deviceMemory as number | undefined;
    const lowEnd = isMobile || (typeof devMem === "number" && devMem <= 4);
    // Đúng 50fps như yêu cầu
    const targetFps = 50;
    const frameInterval = 1000 / targetFps;
    const vBitrate = lowEnd ? 2_500_000 : 5_000_000;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // --- IDB chunks video ---
    const DB_NAME = "ontop-vid-only";
    const STORE = "chunks";
    const openDb = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const idbClear = async () => {
      try {
        const db = await openDb();
        await new Promise<void>((res, rej) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).clear();
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });
        db.close();
      } catch {}
    };
    const idbPut = async (key: number, blob: Blob) => {
      const db = await openDb();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    };
    const idbGetAll = async (n: number) => {
      const parts: Blob[] = [];
      for (let i = 0; i < n; i++) {
        const db = await openDb();
        const b = await new Promise<Blob | null>((res, rej) => {
          const tx = db.transaction(STORE, "readonly");
          const r = tx.objectStore(STORE).get(i);
          r.onsuccess = () => res((r.result as Blob) || null);
          r.onerror = () => rej(r.error);
        });
        db.close();
        if (b) parts.push(b);
      }
      return parts;
    };
    await idbClear();

    // Logo
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
        setTimeout(() => resolve(), 1200);
      });
    }

    // Overlay tĩnh
    const overlay = document.createElement("canvas");
    overlay.width = W;
    overlay.height = H;
    const octx = overlay.getContext("2d")!;
    {
      const grad = octx.createLinearGradient(0, H * 0.62, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.42)");
      octx.fillStyle = grad;
      octx.fillRect(0, H * 0.62, W, H * 0.38);
      const logo = logoImgRef.current;
      if (logo && logo.complete && logo.naturalWidth > 0) {
        const logoW = Math.round(W * 0.2);
        const logoH = Math.round((logo.naturalHeight / logo.naturalWidth) * logoW);
        octx.drawImage(logo, Math.round(W * 0.032), Math.round(H * 0.04), logoW, logoH);
      }
      const title = (songTitle || "").toUpperCase().slice(0, 90);
      const sub = (artist || "").toUpperCase().slice(0, 60);
      const leftPad = Math.round(W * 0.0376);
      const barW = Math.max(2, Math.round(W * 0.002));
      const titleSize = Math.round(W * 0.024);
      const subSize = Math.round(W * 0.015);
      const textX = leftPad + barW + Math.round(W * 0.014);
      const baseY = H - Math.round(H * 0.075);
      octx.fillStyle = "#fff";
      octx.font = `300 ${titleSize}px "Be Vietnam Pro", sans-serif`;
      const titleH = titleSize * 1.15;
      octx.font = `500 ${subSize}px Inter, sans-serif`;
      const subH = subSize * 1.2;
      const gap = Math.round(H * 0.012);
      const blockH = titleH + gap + subH;
      const extend = Math.round(H * 0.012);
      octx.fillRect(leftPad, baseY - blockH - extend, barW, blockH + extend * 2);
      octx.font = `300 ${titleSize}px "Be Vietnam Pro", sans-serif`;
      octx.shadowColor = "rgba(0,0,0,0.45)";
      octx.shadowBlur = 3;
      octx.textAlign = "left";
      octx.textBaseline = "bottom";
      octx.fillText(title, textX, baseY - subH - gap);
      octx.font = `500 ${subSize}px Inter, sans-serif`;
      octx.fillStyle = "rgba(255,255,255,0.92)";
      octx.fillText(sub, textX, baseY);
      octx.shadowBlur = 0;
    }

    const drawFast = () => {
      const vw = video.videoWidth || W;
      const vh = video.videoHeight || H;
      const base = Math.max(W / vw, H / vh);
      const dw = vw * base;
      const dh = vh * base;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      try {
        ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } catch {}
      ctx.drawImage(overlay, 0, 0);
    };

    // Chỉ VIDEO — không đưa audio vào MediaRecorder (triệt tiêu tạch/giật/chậm)
    const mime =
      [
        "video/webm;codecs=vp8",
        "video/webm;codecs=vp9",
        "video/webm",
        "video/mp4",
      ].find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) || "video/webm";

    let canvasStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let drawing = true;
    let chunkIndex = 0;
    let lastDraw = 0;
    let lastProg = 0;

    try {
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      try {
        video.playbackRate = 1;
        audio.playbackRate = 1;
      } catch {}

      canvasStream = canvas.captureStream(targetFps);
      try {
        canvasStream.getVideoTracks()[0].contentHint = "motion";
      } catch {}

      // VIDEO ONLY stream
      const combined = new MediaStream(canvasStream.getVideoTracks());

      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(combined, {
          mimeType: mime,
          videoBitsPerSecond: vBitrate,
        });
      } catch {
        rec = new MediaRecorder(combined, { mimeType: mime });
      }
      recorder = rec;
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (!e.data || !e.data.size) return;
        const key = chunkIndex++;
        idbPut(key, e.data).catch(console.warn);
      };

      const stopped = new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = () => reject(new Error("MediaRecorder lỗi"));
      });

      // Đồng bộ thời gian theo đồng hồ tường (không phụ thuộc audio encode)
      audio.pause();
      video.pause();
      audio.currentTime = 0;
      try {
        audio.playbackRate = 1;
        video.playbackRate = 1;
      } catch {}

      drawFast();
      // Phát nhạc để user nghe preview lúc ghi; KHÔNG ghi audio này
      await video.play();
      try {
        await audio.play();
      } catch {}

      rec.start(2000);

      const t0 = performance.now();
      const loop = (ts: number) => {
        if (!drawing) return;
        if (ts - lastDraw >= frameInterval) {
          lastDraw = ts;
          drawFast();
        }
        if (ts - lastProg > 400) {
          lastProg = ts;
          const elapsed = Math.min(total, (performance.now() - t0) / 1000);
          setProgress(Math.min(70, Math.round((elapsed / total) * 70)));
          setStatus(`Ghi hình 720p50… ${elapsed.toFixed(0)}s / ${total.toFixed(0)}s`);
        }
        // Hết giờ theo wall-clock = đúng độ dài nhạc
        if ((performance.now() - t0) / 1000 >= total) {
          drawing = false;
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      await new Promise<void>((resolve) => {
        const hard = window.setTimeout(() => resolve(), total * 1000 + 500);
        const check = () => {
          if (!drawing || (performance.now() - t0) / 1000 >= total) {
            window.clearTimeout(hard);
            resolve();
            return;
          }
          window.setTimeout(check, 100);
        };
        check();
      });

      drawing = false;
      cancelAnimationFrame(rafRef.current);
      try {
        drawFast();
      } catch {}
      try {
        video.pause();
        audio.pause();
      } catch {}

      if (rec.state === "recording") {
        try {
          rec.requestData();
        } catch {}
        rec.stop();
      }
      await stopped;
      await sleep(350);

      try {
        combined.getTracks().forEach((t) => t.stop());
        canvasStream.getTracks().forEach((t) => t.stop());
      } catch {}

      setStatus("Gộp video…");
      setProgress(75);
      const parts = await idbGetAll(chunkIndex);
      if (!parts.length) throw new Error("Không ghi được video.");
      const videoBlob = new Blob(parts, { type: "video/webm" });
      await idbClear();

      // Lấy file nhạc GỐC (chất lượng như user upload/link)
      setStatus("Ghép nhạc gốc (không qua MediaRecorder)...");
      setProgress(80);
      let audioBytes: Uint8Array;
      let audioName = "music.mp3";
      if (musicFile) {
        const ab = await musicFile.arrayBuffer();
        audioBytes = new Uint8Array(ab);
        audioName = musicFile.name.match(/\.(m4a|aac|wav|ogg|mp3)$/i)
          ? `music${musicFile.name.slice(musicFile.name.lastIndexOf("."))}`
          : "music.mp3";
      } else if (musicObjectUrl.current) {
        const res = await fetch(musicObjectUrl.current);
        audioBytes = new Uint8Array(await res.arrayBuffer());
      } else if (musicUrl.trim()) {
        const res = await fetch(proxyUrl(musicUrl.trim()));
        if (!res.ok) throw new Error("Không tải được file nhạc gốc");
        audioBytes = new Uint8Array(await res.arrayBuffer());
      } else if (audio.src) {
        const res = await fetch(audio.src);
        audioBytes = new Uint8Array(await res.arrayBuffer());
      } else {
        throw new Error("Không tìm thấy file nhạc gốc");
      }

      // ffmpeg: video (câm) + nhạc gốc → MP4, audio chuẩn 100%
      setStatus("Mux MP4 720p50 + audio gốc...");
      setProgress(85);
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });

      const vBuf = new Uint8Array(await videoBlob.arrayBuffer());
      await ffmpeg.writeFile("video.webm", vBuf);
      await ffmpeg.writeFile(audioName, audioBytes);

      // -c:a aac -ar 44100: audio sạch, không giật/tạch
      // -r 50: đúng 50fps; -shortest theo nhạc
      await ffmpeg.exec([
        "-i",
        "video.webm",
        "-i",
        audioName,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-r",
        "50",
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "320k",
        "-shortest",
        "-movflags",
        "+faststart",
        "out.mp4",
      ]);

      const data = await ffmpeg.readFile("out.mp4");
      const u8 =
        typeof data === "string"
          ? new TextEncoder().encode(data)
          : new Uint8Array(data as Uint8Array);
      const ab = new ArrayBuffer(u8.byteLength);
      new Uint8Array(ab).set(u8);
      const finalBlob = new Blob([ab], { type: "video/mp4" });

      try {
        await ffmpeg.deleteFile("video.webm");
        await ffmpeg.deleteFile(audioName);
        await ffmpeg.deleteFile("out.mp4");
      } catch {}

      if (finalBlob.size < 5000) throw new Error("File xuất rỗng");

      const url = URL.createObjectURL(finalBlob);
      setOutputUrl(url);
      setProgress(100);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(songTitle || "video").replace(/\s+/g, "_").slice(0, 40)}_720p50.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus(
        `✅ MP4 720p50 · nhạc gốc sạch · ${total.toFixed(0)}s · ${(finalBlob.size / 1024 / 1024).toFixed(1)}MB`
      );
      setError(null);
    } catch (e: any) {
      console.error(e);
      drawing = false;
      cancelAnimationFrame(rafRef.current);
      try {
        video.pause();
        audio.pause();
      } catch {}
      try {
        if (recorder?.state === "recording") recorder.stop();
      } catch {}
      await idbClear();
      setError(
        e?.message ||
          "Xuất thất bại. Dùng Chrome, đảm bảo đã Load Preview với file nhạc."
      );
      setStatus("Thất bại");
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
            <div ref={previewBoxRef}
              className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-[#333] shadow-lg"
              style={{ containerType: "size" }}>
              <video
                ref={bgVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
                loop
              />
              {/* Gradient đáy */}
              <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

              {/* Logo — scale theo chiều rộng khung (đồng bộ mọi máy) */}
              <img
                src="/logo.png"
                alt="Ontop"
                className="absolute z-10 object-contain pointer-events-none"
                style={{
                  left: framePx.s * 36,
                  top: framePx.s * 28,
                  width: framePx.s * 256,
                  height: "auto",
                }}
              />

              {/* Chữ + thanh dọc — px quy đổi từ design 1280 */}
              <div
                className="absolute z-10 flex items-stretch pointer-events-none"
                style={{
                  left: framePx.s * 48,
                  bottom: framePx.s * 54,
                  maxWidth: framePx.s * 900,
                }}
              >
                <div
                  className="bg-white shrink-0"
                  style={{
                    width: Math.max(2, framePx.s * 2.5),
                    alignSelf: "stretch",
                  }}
                />
                <div
                  className="flex flex-col justify-center min-w-0"
                  style={{
                    paddingLeft: framePx.s * 16,
                    paddingTop: framePx.s * 6,
                    paddingBottom: framePx.s * 6,
                  }}
                >
                  <p
                    className="text-white uppercase leading-none whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-title), 'Be Vietnam Pro', sans-serif",
                      fontWeight: 300,
                      fontSize: Math.max(10, framePx.s * 30),
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {songTitle}
                  </p>
                  <p
                    className="text-white/90 uppercase leading-none whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-artist), Inter, sans-serif",
                      fontWeight: 500,
                      fontSize: Math.max(8, framePx.s * 19),
                      textShadow: "0 1px 3px rgba(0,0,0,0.55)",
                      marginTop: framePx.s * 10,
                      letterSpacing: "0.08em",
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
              <video src={outputUrl} controls playsInline className="w-full rounded-xl bg-black max-h-64" onLoadedMetadata={(e) => { try { e.currentTarget.playbackRate = 1; } catch {} }} />
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
