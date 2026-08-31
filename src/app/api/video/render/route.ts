import { NextRequest, NextResponse } from "next/server";

const API = process.env.VIDEO_API_URL || "https://ontop-video-api.onrender.com";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Wake API first
    try {
      await fetch(`${API}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(50000),
      });
    } catch {}

    const ct = req.headers.get("content-type") || "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const r = await fetch(`${API}/v1/render-form`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(55000),
      });
      const data = await r.json().catch(() => ({}));
      return NextResponse.json(data, { status: r.status });
    }

    const body = await req.text();
    const r = await fetch(`${API}/v1/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(55000),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          "Không kết nối được API render (cold start / timeout). Thử lại sau 30s.",
      },
      { status: 502 }
    );
  }
}
