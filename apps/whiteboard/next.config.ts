import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@repo/db",
    "@repo/auth",
    "@repo/email-templates",
  ],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Whiteboard used to live under white-board.io/app. Old links, including
  // invitation emails, keep working (ADR-0035).
  redirects() {
    return Promise.resolve([
      { source: "/app", destination: "/", permanent: false },
      { source: "/app/:path*", destination: "/:path*", permanent: false },
    ]);
  },
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.bun/@prisma+client@*/node_modules/.prisma/client/**/*",
    ],
  },
};

export default nextConfig;
