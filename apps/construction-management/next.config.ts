import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Next runs one dev server per build folder; a second one (another port,
  // another checkout tool) sets NEXT_DIST_DIR.
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",
  transpilePackages: ["@repo/ui", "@repo/db", "@repo/auth"],
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    // The proxy buffers request bodies up to this size and cuts the rest.
    // Above the largest upload (a 10 MB photo, CM-115), so a cut body is
    // still too large and refused rather than stored truncated.
    proxyClientMaxBodySize: "11mb",
  },
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.bun/@prisma+client@*/node_modules/.prisma/client/**/*",
    ],
  },
};

export default nextConfig;
