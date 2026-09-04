import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Ghép chính xác chạy trên client (canvas). API chỉ xác nhận. */
export async function POST(req: NextRequest) {
  return NextResponse.json({
    success: true,
    mode: "client-composite",
    message: "Dùng ghép canvas trên client để giữ full chi tiết ảnh mẫu + chữ rõ.",
  });
}
