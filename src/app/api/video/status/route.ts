import { NextRequest, NextResponse } from "next/server";

const API = process.env.VIDEO_API_URL || "https://ontop-video-api.onrender.com";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  try {
    const r = await fetch(`${API}/v1/status/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: r.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "status failed" },
      { status: 502 }
    );
  }
}
