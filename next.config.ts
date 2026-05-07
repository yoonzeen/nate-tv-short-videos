import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
/** 정적 배포 등 앱이 서브 경로에 올 때 사용 (예: https://host.github.io/shortnews/) */
const BASE_PATH = "/shortnews";

const nextConfig: NextConfig = {
  output: isGithubPages ? "export" : undefined,
  trailingSlash: isGithubPages,
  images: {
    unoptimized: true,
  },
  basePath: isGithubPages ? BASE_PATH : undefined,
  assetPrefix: isGithubPages ? `${BASE_PATH}/` : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: isGithubPages ? BASE_PATH : "",
  },
  async headers() {
    return [
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
