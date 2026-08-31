import { NextResponse } from "next/server";

const API = process.env.VIDEO_API_URL || "https://ontop-video-api.onrender.com";

export async function GET() {
  try {
    const r = await fetch(`${API}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "API unreachable" },
      { status: 502 }
    );
  }
}
