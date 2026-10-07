import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  basePath: "/app",
  transpilePackages: [
    "@repo/ui",
    "@repo/db",
    "@repo/auth",
    "@repo/email-templates",
  ],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.bun/@prisma+client@*/node_modules/.prisma/client/**/*",
    ],
  },
};

export default nextConfig;
