import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@repo/whiteboard-db",
    "@repo/auth",
    "@repo/email-templates",
  ],
  serverExternalPackages: ["@prisma/client"],
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
