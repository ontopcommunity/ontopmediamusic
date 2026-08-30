import type { Metadata } from "next";
import { Be_Vietnam_Pro, Inter } from "next/font/google";
import "./globals.css";

// Tên bài: mỏng, hỗ trợ tiếng Việt
const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500"],
  variable: "--font-title",
  display: "swap",
});

// Tác giả / label: khác style, vẫn Việt hoá
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-artist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ontop Media Music - Auto Video Generator",
  description: "Preview & xuất video nhạc 720p layout chuẩn",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} ${inter.variable} h-full antialiased`}
    >
      <body className={`${inter.className} min-h-full flex flex-col bg-[#0a0a0a] text-white`}>
        {children}
      </body>
    </html>
  );
}
