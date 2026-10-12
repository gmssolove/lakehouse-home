import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

const isTauriBuild = process.env.TAURI_BUILD === '1';

/* next dev 전용. production build/CI에는 .open-next/worker.js가 아직 없어서 wrangler가 즉시 실패함 */
if (!isTauriBuild && process.env.NODE_ENV !== 'production') {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  ...(isTauriBuild
    ? {
        output: 'export' as const,
        trailingSlash: true,
        assetPrefix: '',
      }
    : {}),
  /* StrictMode double-mount 가 portal/YT unmount removeChild 레이스를 키움 (dev) */
  reactStrictMode: false,
  devIndicators: {
    position: 'bottom-left',
  },
  serverExternalPackages: [
    'aws4fetch',
    ...(process.env.NODE_ENV === 'development' ? ['three'] : []),
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
    ...(isTauriBuild
      ? {}
      : {
          middlewareClientMaxBodySize: '12mb',
        }),
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    unoptimized: true,
  },
  ...(!isTauriBuild
    ? {
        async redirects() {
          return [
            { source: '/kisaragi.html', destination: '/verse/gate', permanent: false },
            { source: '/kisaragi', destination: '/verse/gate', permanent: false },
            { source: '/vn-test', destination: '/vn/test_scene', permanent: false },
            { source: '/vn-test/', destination: '/vn/test_scene', permanent: false },
          ];
        },
        async rewrites() {
          /* 브라우저 기본 /favicon.ico → Admin 파비콘 프록시 (OC/Pair 하드로드 포함) */
          return [{ source: '/favicon.ico', destination: '/api/site-favicon' }];
        },
        async headers() {
          if (process.env.NODE_ENV !== 'production') {
            return [];
          }
          return [
            {
              source: '/:path*',
              headers: [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains; preload',
                },
              ],
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
