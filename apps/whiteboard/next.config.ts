import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

const nextConfig: NextConfig = {
  // The sidebar's version line (ADR-0049) reads this instead of importing
  // package.json into client code, which would ship the dependency list.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  transpilePackages: [
    "@repo/ui",
    "@repo/whiteboard-db",
    "@repo/auth",
    "@repo/email-templates",
  ],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Report PDFs embed Noto fonts read from node_modules at run time
  // (`report-noto-text.ts`), which tracing cannot see.
  outputFileTracingIncludes: {
    "/api/training-institute/reports/[report]/download": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    "/api/training-institute/reports/[report]/email": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
  },
  // The Prisma client is generated inside the db package (ADR-0040) and
  // bundled into the server chunks, so it looks for its query engine next to
  // the chunk, not in the package. Copy the engine there.
  webpack: (config: { plugins: unknown[] }, { isServer }) => {
    if (isServer) config.plugins.push(new PrismaPlugin());
    return config;
  },
};

export default nextConfig;
