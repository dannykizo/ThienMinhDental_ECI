import type { NextConfig } from 'next';

const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  agentRules: false,
  output: isStaticExport ? 'export' : undefined,
  reactStrictMode: true,
  images: {
    unoptimized: isStaticExport,
  },
  trailingSlash: isStaticExport,
};

export default nextConfig;
