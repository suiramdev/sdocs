import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  outputFileTracingIncludes: {
    "/api/v1/mcpb/route": [
      "./data/api/tools/*.json",
      "./generated/mcpb/server/index.js",
    ],
  },
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
    "tree-sitter-bash",
    "tree-sitter-c-sharp",
    "tree-sitter-json",
    "web-tree-sitter",
  ],
};

export default withMDX(config);
