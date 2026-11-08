import type { NextConfig } from 'next';

const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  // Allow isolated verification builds without overwriting the running dev server.
  distDir: process.env.NEXT_BUILD_DIR ?? '.next',
  agentRules: false,
  output: isStaticExport ? 'export' : undefined,
  reactStrictMode: true,
  images: {
    unoptimized: isStaticExport,
  },
  trailingSlash: isStaticExport,
};

export default nextConfig;
