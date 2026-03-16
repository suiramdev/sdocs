import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  redirects() {
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
  rewrites() {
    return [
      {
        destination: "/llms.mdx/docs/:path*",
        source: "/docs/:path*.mdx",
      },
    ];
  },
  serverExternalPackages: [
    "@takumi-rs/image-response",
  ],
};

export default withMDX(config);
