import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

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
  // The Prisma client is generated inside the db package (ADR-0040) and
  // bundled into the server chunks, so it looks for its query engine next to
  // the chunk, not in the package. Copy the engine there.
  webpack: (config: { plugins: unknown[] }, { isServer }) => {
    if (isServer) config.plugins.push(new PrismaPlugin());
    return config;
  },
};

export default nextConfig;
