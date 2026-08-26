# Ontop Media Music

Auto Video Generator cho style Vinahouse TikTok.

## Tính năng
- Giao diện tối, dễ dùng
- Nhập tên bài + tác giả
- Upload nhạc hoặc dán link
- Video nền ngẫu nhiên từ 4 link đêm mưa (mute audio gốc)
- Cắt ngẫu nhiên đoạn có độ dài = nhạc
- Thêm text overlay (title + artist)
- Tạo thumbnail
- Auto generate caption + hashtag
- Download video & thumbnail

## Tech
- Next.js 16 + Tailwind + TypeScript
- FFmpeg.wasm (client-side)

## Deploy
Repo: ontopcommunity/ontopmediamusic
Vercel project: ontopmediamusic

## Lưu ý
- TikTok CDN có thể bị CORS → hệ thống có fallback video
- Auto-post TikTok bằng cookie không ổn định trên serverless → khuyến nghị đăng thủ công
