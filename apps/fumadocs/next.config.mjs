import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        destination: "/docs/api",
        permanent: true,
        source: "/docs/sdk",
      },
      {
        destination: "/docs/api/:path*",
        permanent: true,
        source: "/docs/sdk/:path*",
      },
    ];
  },
  async rewrites() {
    return [
      {
        destination: "/api/api/tools/search-api",
        source: "/api/sdk/tools/search-sdk",
      },
      {
        destination: "/api/api/:path*",
        source: "/api/sdk/:path*",
      },
      {
        destination: "/llms.mdx/docs/:path*",
        source: "/docs/:path*.mdx",
      },
    ];
  },
  serverExternalPackages: ["@takumi-rs/image-response"],
};

export default withMDX(config);
