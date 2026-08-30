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
    setStatus("Xuất từng đoạn → tự ghép 1 file...");

    const video = bgVideoRef.current;
    const audio = audioRef.current;
    const canvas = canvasRef.current!;
    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";

    const total = Math.max(
      3,
      duration || (isFinite(audio.duration) ? audio.duration : 30)
    );

    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const devMem = (navigator as any).deviceMemory as number | undefined;
    const lowEnd = isMobile || (typeof devMem === "number" && devMem <= 4);

    const targetFps = lowEnd ? 50 : 60;
    const frameInterval = 1000 / targetFps;
    const vBitrate = lowEnd ? 2_500_000 : 5_000_000;
    const aBitrate = lowEnd ? 128_000 : 160_000;
    // Đoạn ngắn hơn trên máy yếu để không OOM khi ghi
    const segmentSec = lowEnd ? 15 : 40;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // --- IndexedDB: giữ từng đoạn ngoài RAM JS ---
    const DB_NAME = "ontop-export-segs";
    const STORE = "segs";
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
    const idbSet = async (key: string, val: Blob) => {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    };
    const idbGet = async (key: string): Promise<Blob | null> => {
      const db = await openDb();
      const out = await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve((r.result as Blob) || null);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return out;
    };
    const idbClear = async () => {
      try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch {}
    };
    await idbClear();

    // Overlay cache
    const overlay = document.createElement("canvas");
    overlay.width = W;
    overlay.height = H;
    const octx = overlay.getContext("2d")!;
    const paintOverlay = () => {
      octx.clearRect(0, 0, W, H);
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
      const fontTitle = `300 ${titleSize}px "Be Vietnam Pro", sans-serif`;
      const fontSub = `500 ${subSize}px Inter, sans-serif`;
      octx.font = fontTitle;
      const titleH = titleSize * 1.15;
      octx.font = fontSub;
      const subH = subSize * 1.2;
      const gap = Math.round(H * 0.012);
      const blockH = titleH + gap + subH;
      const extend = Math.round(H * 0.012);
      octx.fillRect(leftPad, baseY - blockH - extend, barW, blockH + extend * 2);
      octx.font = fontTitle;
      octx.shadowColor = "rgba(0,0,0,0.45)";
      octx.shadowBlur = 3;
      octx.textAlign = "left";
      octx.textBaseline = "bottom";
      octx.fillText(title, textX, baseY - subH - gap);
      octx.font = fontSub;
      octx.fillStyle = "rgba(255,255,255,0.92)";
      octx.fillText(sub, textX, baseY);
      octx.shadowBlur = 0;
    };

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
        setTimeout(() => resolve(), 1500);
      });
    }
    paintOverlay();

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

    const mime =
      [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) || "video/webm";
    const isMp4 = mime.includes("mp4");
    const ext = isMp4 ? "mp4" : "webm";

    const getAudioTrack = (): MediaStreamTrack | null => {
      try {
        const cap =
          (audio as any).captureStream?.bind(audio) ||
          (audio as any).mozCaptureStream?.bind(audio);
        if (cap) return cap().getAudioTracks()[0] || null;
      } catch {}
      try {
        if (!audioGraphRef.current) {
          const actx = new AudioContext();
          const source = actx.createMediaElementSource(audio);
          const dest = actx.createMediaStreamDestination();
          source.connect(dest);
          audioGraphRef.current = { ctx: actx, source };
          return dest.stream.getAudioTracks()[0] || null;
        }
        const dest = audioGraphRef.current.ctx.createMediaStreamDestination();
        try {
          audioGraphRef.current.source.disconnect();
        } catch {}
        audioGraphRef.current.source.connect(dest);
        return dest.stream.getAudioTracks()[0] || null;
      } catch {
        return null;
      }
    };

    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    const numParts = Math.ceil(total / segmentSec);
    const segKeys: string[] = [];

    try {
      // ===== PHASE 1: ghi từng đoạn → IndexedDB =====
      for (let i = 0; i < numParts; i++) {
        const segStart = i * segmentSec;
        const segLen = Math.min(segmentSec, total - segStart);
        setStatus(`Ghi đoạn ${i + 1}/${numParts} (${segLen.toFixed(0)}s)...`);
        setProgress(Math.round((i / numParts) * 70));

        audio.pause();
        video.pause();
        try {
          audio.currentTime = segStart;
        } catch {}
        await sleep(lowEnd ? 350 : 120);

        const canvasStream = canvas.captureStream(targetFps);
        try {
          canvasStream.getVideoTracks()[0].contentHint = "motion";
        } catch {}
        const aTrack = getAudioTrack();
        const combined = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...(aTrack ? [aTrack] : []),
        ]);

        const chunks: Blob[] = [];
        let rec: MediaRecorder;
        try {
          rec = new MediaRecorder(combined, {
            mimeType: mime,
            videoBitsPerSecond: vBitrate,
            audioBitsPerSecond: aBitrate,
          });
        } catch {
          rec = new MediaRecorder(combined, { mimeType: mime });
        }
        rec.ondataavailable = (e) => {
          if (e.data?.size) chunks.push(e.data);
        };
        const stopped = new Promise<void>((resolve, reject) => {
          rec.onstop = () => resolve();
          rec.onerror = () => reject(new Error("Lỗi ghi đoạn " + (i + 1)));
        });

        drawFast();
        await video.play();
        await audio.play();
        rec.start(2000);

        let drawing = true;
        let lastDraw = 0;
        const segEnd = segStart + segLen;
        const loop = (ts: number) => {
          if (!drawing) return;
          if (ts - lastDraw >= frameInterval) {
            lastDraw = ts;
            drawFast();
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

        await new Promise<void>((resolve) => {
          const hard = window.setTimeout(() => resolve(), segLen * 1000 + 700);
          const check = () => {
            if ((audio.currentTime || 0) >= segEnd - 0.08 || audio.ended) {
              window.clearTimeout(hard);
              resolve();
              return;
            }
            window.setTimeout(check, 120);
          };
          check();
        });

        drawing = false;
        cancelAnimationFrame(rafRef.current);
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
        combined.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });

        const blob = new Blob(chunks, {
          type: isMp4 ? "video/mp4" : "video/webm",
        });
        chunks.length = 0;
        if (blob.size < 800) throw new Error(`Đoạn ${i + 1} rỗng`);

        const key = `p${i}`;
        await idbSet(key, blob);
        segKeys.push(key);
        await sleep(lowEnd ? 600 : 200);
      }

      // ===== PHASE 2: ghép 1 file =====
      setStatus("Đang ghép thành 1 file...");
      setProgress(75);

      let finalBlob: Blob | null = null;

      // 2a. Thử ffmpeg -c copy (nhanh, không re-encode)
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        const ffmpeg = new FFmpeg();
        const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        });

        const listLines: string[] = [];
        for (let i = 0; i < segKeys.length; i++) {
          const b = await idbGet(segKeys[i]);
          if (!b) throw new Error("Thiếu đoạn " + i);
          const buf = new Uint8Array(await b.arrayBuffer());
          const name = `seg${i}.${ext}`;
          await ffmpeg.writeFile(name, buf);
          listLines.push(`file '${name}'`);
          setProgress(75 + Math.round(((i + 1) / segKeys.length) * 10));
        }
        await ffmpeg.writeFile(
          "list.txt",
          new TextEncoder().encode(listLines.join("\n"))
        );
        // -c copy: ghép không render lại → nhẹ + giữ chất lượng
        await ffmpeg.exec([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "list.txt",
          "-c",
          "copy",
          `out.${ext}`,
        ]);
        const data = await ffmpeg.readFile(`out.${ext}`);
        const u8 =
          typeof data === "string"
            ? new TextEncoder().encode(data)
            : new Uint8Array(data as Uint8Array);
        const ab = new ArrayBuffer(u8.byteLength);
        new Uint8Array(ab).set(u8);
        finalBlob = new Blob([ab], {
          type: isMp4 ? "video/mp4" : "video/webm",
        });
        try {
          for (let i = 0; i < segKeys.length; i++) {
            await ffmpeg.deleteFile(`seg${i}.${ext}`);
          }
          await ffmpeg.deleteFile("list.txt");
          await ffmpeg.deleteFile(`out.${ext}`);
        } catch {}
      } catch (mergeErr) {
        console.warn("ffmpeg concat failed, blob join fallback", mergeErr);
        // 2b. Fallback: nối Blob tuần tự (webm cùng codec thường chơi được)
        const parts: Blob[] = [];
        for (const k of segKeys) {
          const b = await idbGet(k);
          if (b) parts.push(b);
        }
        finalBlob = new Blob(parts, {
          type: isMp4 ? "video/mp4" : "video/webm",
        });
      }

      await idbClear();

      if (!finalBlob || finalBlob.size < 2000) {
        throw new Error("Ghép file thất bại / file rỗng");
      }

      setProgress(100);
      const url = URL.createObjectURL(finalBlob);
      setOutputUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(songTitle || "video").replace(/\s+/g, "_").slice(0, 40)}_720p${targetFps}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus(
        `✅ 1 file · 720p${targetFps} · ~${total.toFixed(0)}s · ${(finalBlob.size / 1024 / 1024).toFixed(1)}MB`
      );
      setError(null);
    } catch (e: any) {
      console.error(e);
      cancelAnimationFrame(rafRef.current);
      try {
        video.pause();
        audio.pause();
      } catch {}
      setError(
        e?.message ||
          "Xuất/ghép lỗi. Dùng Chrome, đóng app khác, thử lại."
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
