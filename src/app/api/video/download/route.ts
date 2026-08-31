import { NextRequest, NextResponse } from "next/server";

const API = process.env.VIDEO_API_URL || "https://ontop-video-api.onrender.com";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  }
  try {
    const r = await fetch(`${API}/v1/download/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: t || `Download HTTP ${r.status}` },
        { status: r.status }
      );
    }
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="ontop_${id}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Download failed" },
      { status: 502 }
    );
  }
}
