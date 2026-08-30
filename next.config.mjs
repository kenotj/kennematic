/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /* The plate and its poster are content-stable — a new cut ships under a new
     filename. Without this they are served must-revalidate and every repeat
     visit pays a round trip before the hero can paint. */
  async headers() {
    return [
      {
        source: '/:file(plate.mp4|plate-poster.webp)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
