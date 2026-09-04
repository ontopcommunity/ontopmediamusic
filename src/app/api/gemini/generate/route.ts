import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * API giữ tương thích form cũ.
 * Ghép ảnh layout mẫu chạy trên client (canvas) để khớp 100% tọa độ.
 * Endpoint này chỉ validate input + trả meta; client tự composite.
 * Nếu client gửi ?server=1 và có sharp thì có thể mở rộng sau.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const songTitle = String(form.get("songTitle") || "UNTITLED");
    const artist = String(form.get("artist") || "");
    const part = String(form.get("part") || "P1");
    const durationSec = Number(form.get("durationSec") || 60);
    const coverFile = form.get("cover") as File | null;
    const coverUrl = String(form.get("coverUrl") || "").trim();

    if ((!coverFile || coverFile.size === 0) && !coverUrl.startsWith("http")) {
      return NextResponse.json(
        { error: "Cần upload ảnh cover hoặc link ảnh" },
        { status: 400 }
      );
    }

    // Trả về chế độ client-composite (page sẽ ghép)
    return NextResponse.json({
      success: true,
      mode: "client-composite",
      templateUrl: `${req.nextUrl.origin}/template-music-card.png`,
      songTitle,
      artist,
      part,
      durationSec,
      message:
        "Client sẽ ghép ảnh mẫu + cover + chữ để giữ layout 100%.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500 }
    );
  }
}
