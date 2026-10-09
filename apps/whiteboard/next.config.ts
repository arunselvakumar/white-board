import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@repo/whiteboard-db",
    "@repo/auth",
    "@repo/email-templates",
  ],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // The Prisma client and its query engine are generated inside the db
  // package (ADR-0040); ship them with every route.
  outputFileTracingIncludes: {
    "/*": ["../../packages/db/whiteboard/generated/client/**/*"],
  },
};

export default nextConfig;
