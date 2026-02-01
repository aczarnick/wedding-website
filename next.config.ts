import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  images: {
    qualities: [25, 50, 75, 90],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;

