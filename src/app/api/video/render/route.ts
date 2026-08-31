import { NextRequest, NextResponse } from "next/server";

const API = process.env.VIDEO_API_URL || "https://ontop-video-api.onrender.com";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // fire-and-forget wake
    fetch(`${API}/v1/ping`, { cache: "no-store" }).catch(() => {});

    const ct = req.headers.get("content-type") || "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      // rebuild FormData for node fetch
      const out = new FormData();
      for (const [k, v] of form.entries()) {
        out.append(k, v as any);
      }
      const r = await fetch(`${API}/v1/render-form`, {
        method: "POST",
        body: out,
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
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.name === "TimeoutError" || e?.name === "AbortError"
            ? "API đang cold start — đợi 20s bấm lại."
            : e?.message || "Proxy render failed",
      },
      { status: 502 }
    );
  }
}
