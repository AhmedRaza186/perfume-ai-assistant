import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ['ffprobe-static'],
  // ffprobe-static builds its binary path at runtime, so tracing misses it; ship the Linux build with the voice route.
  outputFileTracingIncludes: {
    '/api/voice-query': ['./node_modules/ffprobe-static/bin/linux/x64/ffprobe'],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
