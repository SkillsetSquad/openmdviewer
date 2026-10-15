import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  // Root and subpath exports must compile current source independently.
  experimental: { turbopackFileSystemCacheForBuild: false },
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};
export default nextConfig;
