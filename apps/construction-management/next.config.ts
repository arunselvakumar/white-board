import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Next runs one dev server per build folder; a second one (another port,
  // another checkout tool) sets NEXT_DIST_DIR.
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",
  transpilePackages: [
    "@repo/ui",
    "@repo/construction-db",
    "@repo/auth",
    "@repo/email-templates",
  ],
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    // The proxy buffers request bodies up to this size and cuts the rest.
    // Above the largest upload through our routes (a 25 MB Project
    // document on local disk, CM-414; deployed, those go straight to
    // Vercel Blob), so a cut body is still too large and refused rather
    // than stored truncated.
    proxyClientMaxBodySize: "26mb",
  },
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // The Prisma client and its query engine are generated inside the db
  // package (ADR-0040); ship them with every route.
  outputFileTracingIncludes: {
    "/*": ["../../packages/db/construction/generated/client/**/*"],
  },
};

export default nextConfig;
