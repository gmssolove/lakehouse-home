import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@aws-sdk/client-s3'],
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    unoptimized: true,
  },
};

export default nextConfig;
