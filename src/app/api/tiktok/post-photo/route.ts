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

function cookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** Best-effort TikTok photo carousel post (unofficial). */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const caption = String(form.get("caption") || "");
    const cookieFromClient = String(form.get("cookies") || "");
    const cookieFromEnv = process.env.TIKTOK_COOKIES || "";
    const cookieStr = cookieFromClient.trim() || cookieFromEnv.trim();

    if (!cookieStr) {
      return NextResponse.json(
        {
          error:
            "Thiếu cookie TikTok (sessionid). Dán cookie hoặc set TIKTOK_COOKIES.",
        },
        { status: 400 }
      );
    }

    const cookies = parseCookies(cookieStr);
    if (!cookies.sessionid && !cookies.sessionid_ss) {
      return NextResponse.json(
        { error: "Cookie thiếu sessionid" },
        { status: 400 }
      );
    }

    const images: File[] = [];
    for (const [k, v] of form.entries()) {
      if (k.startsWith("image") && v instanceof File) images.push(v);
    }
    if (images.length === 0) {
      return NextResponse.json({ error: "Thiếu ảnh" }, { status: 400 });
    }

    const uploadedIds: string[] = [];
    const details: string[] = [];

    for (const img of images) {
      const buf = Buffer.from(await img.arrayBuffer());
      const endpoints = [
        "https://www.tiktok.com/api/upload/image/?aid=1988",
        "https://www.tiktok.com/tiktok/web/project/photo/upload/?aid=1988",
      ];
      let ok = false;
      for (const ep of endpoints) {
        const fd = new FormData();
        fd.append(
          "file",
          new Blob([buf], { type: img.type || "image/jpeg" }),
          img.name || "photo.jpg"
        );
        const r = await fetch(ep, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            Cookie: cookieHeader(cookies),
            Referer: "https://www.tiktok.com/tiktokstudio/upload",
            Origin: "https://www.tiktok.com",
          },
          body: fd,
        });
        const t = await r.text();
        details.push(t.slice(0, 300));
        try {
          const j = JSON.parse(t);
          const id =
            j?.data?.image_id ||
            j?.data?.uri ||
            j?.image_id ||
            j?.data?.photo_id;
          if (id) {
            uploadedIds.push(String(id));
            ok = true;
            break;
          }
        } catch {
          /* continue */
        }
      }
      if (!ok) {
        /* try next image anyway */
      }
    }

    if (uploadedIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Không upload được ảnh lên TikTok (cookie/API). Ảnh đã tạo vẫn tải được trên web.",
          details: details.slice(0, 3),
        },
        { status: 502 }
      );
    }

    const postBody = {
      caption,
      text: caption,
      image_list: uploadedIds,
      photo_list: uploadedIds,
      post_common_info: { visibility_type: 0 },
    };
    const postEps = [
      "https://www.tiktok.com/tiktok/web/project/post/v1/?aid=1988",
      "https://www.tiktok.com/api/v1/item/create/?aid=1988",
    ];
    for (const ep of postEps) {
      const pr = await fetch(ep, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Cookie: cookieHeader(cookies),
          "Content-Type": "application/json",
          Referer: "https://www.tiktok.com/tiktokstudio/upload",
          Origin: "https://www.tiktok.com",
        },
        body: JSON.stringify(postBody),
      });
      const pt = await pr.text();
      try {
        const pj = JSON.parse(pt);
        if (pj?.status_code === 0 || pj?.data?.item_id || pj?.item_id) {
          return NextResponse.json({
            success: true,
            message: "Đã gửi đăng photo TikTok",
            itemId: pj?.data?.item_id || pj?.item_id,
            uploadedIds,
          });
        }
      } catch {
        /* */
      }
    }

    return NextResponse.json({
      success: false,
      error:
        "Upload ảnh được một phần nhưng tạo bài thất bại. Tải ảnh về đăng tay.",
      uploadedIds,
      details: details.slice(0, 2),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "post-photo failed" },
      { status: 500 }
    );
  }
}
