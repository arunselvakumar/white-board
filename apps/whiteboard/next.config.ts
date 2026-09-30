import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/app",
  transpilePackages: ["@repo/ui", "@repo/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
