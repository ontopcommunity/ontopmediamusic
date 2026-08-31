import { NextRequest, NextResponse } from "next/server";

const API = "https://api.json2video.com/v2";

/** Lấy presigned URL để client upload file lên JSON2Video media CDN */
export async function POST(req: NextRequest) {
  const key = process.env.JSON2VIDEO_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Thiếu JSON2VIDEO_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { name, contentType, size, folder } = body as {
      name?: string;
      contentType?: string;
      size?: number;
      folder?: string;
    };

    if (!name || !contentType || !size) {
      return NextResponse.json(
        { error: "Cần name, contentType, size" },
        { status: 400 }
      );
    }

    // Luôn đổi tên unique để không bị "file already exists"
    const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const dot = safe.lastIndexOf(".");
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    const uniqueName = `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

    const res = await fetch(`${API}/media/file`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: uniqueName,
        contentType,
        size,
        folder: folder || "temp",
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return NextResponse.json(
        {
          error:
            data.message ||
            data.error ||
            `Upload init HTTP ${res.status}`,
          detail: data,
        },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      uploadUrl: data.uploadUrl,
      fileUrl: data.fileUrl,
      expiresIn: data.expiresIn,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload init failed" },
      { status: 500 }
    );
  }
}
