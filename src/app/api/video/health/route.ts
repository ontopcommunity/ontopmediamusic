import { NextResponse } from "next/server";

const API = process.env.VIDEO_API_URL || "https://ontop-video-api.onrender.com";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch(`${API}/v1/ping`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json().catch(() => ({ ok: r.ok }));
    return NextResponse.json(data, {
      status: r.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "API sleep / unreachable" },
      { status: 502 }
    );
  }
}
