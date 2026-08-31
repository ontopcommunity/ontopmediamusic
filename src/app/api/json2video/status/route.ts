import { NextRequest, NextResponse } from "next/server";

const API = "https://api.json2video.com/v2";

export async function GET(req: NextRequest) {
  const key = process.env.JSON2VIDEO_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Thiếu JSON2VIDEO_API_KEY" },
      { status: 500 }
    );
  }

  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Thiếu project id" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API}/movies?project=${encodeURIComponent(project)}`,
      { headers: { "x-api-key": key }, cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || data.error || `HTTP ${res.status}`, detail: data },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Status failed" },
      { status: 500 }
    );
  }
}
