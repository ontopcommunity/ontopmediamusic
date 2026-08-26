import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function parseCookies(cookieStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  cookieStr.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function tiktokFetch(
  url: string,
  cookies: Record<string, string>,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers || {});
  headers.set("User-Agent", UA);
  headers.set("Cookie", cookieHeader(cookies));
  headers.set("Referer", "https://www.tiktok.com/tiktokstudio/upload");
  headers.set("Origin", "https://www.tiktok.com");
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/plain, */*");

  return fetch(url, { ...init, headers });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const video = form.get("video") as File | null;
    const caption = (form.get("caption") as string) || "";
    const cookieFromClient = (form.get("cookies") as string) || "";
    const cookieFromEnv = process.env.TIKTOK_COOKIES || "";

    const cookieStr = cookieFromClient.trim() || cookieFromEnv.trim();
    if (!cookieStr) {
      return NextResponse.json(
        {
          error:
            "Thiếu cookie TikTok. Dán cookie (cần có sessionid) vào ô Cookie hoặc set env TIKTOK_COOKIES.",
        },
        { status: 400 }
      );
    }

    if (!video) {
      return NextResponse.json({ error: "Thiếu file video" }, { status: 400 });
    }

    const cookies = parseCookies(cookieStr);
    if (!cookies.sessionid && !cookies.sessionid_ss) {
      return NextResponse.json(
        {
          error:
            "Cookie thiếu sessionid. Vào tiktok.com (đã login) → F12 → Application → Cookies → copy sessionid + toàn bộ cookie string.",
        },
        { status: 400 }
      );
    }

    const size = video.size;
    if (size > 20 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: `Video ${(size / 1024 / 1024).toFixed(1)}MB quá lớn cho API serverless (khuyến nghị <15–20MB).`,
        },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await video.arrayBuffer());
    let lastDetail = "";
    let videoId: string | null = null;
    let uploadOk = false;

    // Warm / auth endpoints
    const authEps = [
      "https://www.tiktok.com/api/v1/video/upload/auth/?aid=1988",
      "https://www.tiktok.com/tiktok/creator/prepare/?aid=1988",
    ];
    for (const ep of authEps) {
      try {
        const r = await tiktokFetch(ep, cookies, { method: "GET" });
        lastDetail = (await r.text()).slice(0, 500);
      } catch (e: any) {
        lastDetail = e?.message || "auth fetch fail";
      }
    }

    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const vodRes = await tiktokFetch(
      "https://www.tiktok.com/api/v1/video/upload/?aid=1988",
      cookies,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: multipart as any,
      }
    );
    const vodText = await vodRes.text();
    try {
      const vodJson = JSON.parse(vodText);
      if (vodJson?.data?.video_id || vodJson?.video_id || vodJson?.data?.item_id) {
        videoId = vodJson?.data?.video_id || vodJson?.video_id || vodJson?.data?.item_id;
        uploadOk = true;
      }
      lastDetail = JSON.stringify(vodJson).slice(0, 600);
    } catch {
      lastDetail = vodText.slice(0, 600);
    }

    if (uploadOk && videoId) {
      const postBody = {
        text: caption,
        desc: caption,
        video_id: videoId,
        post_common_info: { visibility_type: 0, caption },
      };
      const postEps = [
        "https://www.tiktok.com/tiktok/web/project/post/v1/?aid=1988",
        "https://www.tiktok.com/api/v1/item/create/?aid=1988",
      ];
      for (const ep of postEps) {
        const pr = await tiktokFetch(ep, cookies, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        });
        const pt = await pr.text();
        try {
          const pj = JSON.parse(pt);
          if (pj?.status_code === 0 || pj?.data?.item_id || pj?.item_id) {
            return NextResponse.json({
              success: true,
              message: "Đã gửi đăng TikTok.",
              itemId: pj?.data?.item_id || pj?.item_id || videoId,
              detail: pj,
            });
          }
          lastDetail = JSON.stringify(pj).slice(0, 600);
        } catch {
          lastDetail = pt.slice(0, 600);
        }
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Không đăng được qua unofficial API. Cookie hết hạn / thiếu sessionid, hoặc TikTok đổi endpoint (thường cần ký X-Bogus).",
        hints: [
          "Login tiktok.com → F12 → Application → Cookies → copy full cookie (bắt buộc có sessionid)",
          "Dán vào ô Cookie trên web",
          "Video nên < 15MB",
          "Thử lại sau khi refresh cookie mới",
        ],
        debug: {
          hasSessionId: !!(cookies.sessionid || cookies.sessionid_ss),
          videoSizeMB: (size / 1024 / 1024).toFixed(2),
          lastDetail: lastDetail.slice(0, 400),
        },
      },
      { status: 502 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "Internal error khi đăng TikTok" },
      { status: 500 }
    );
  }
}
