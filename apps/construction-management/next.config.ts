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
  // On Vercel, skip `next build`'s own type check: CI's `check-types` already
  // gates every commit, and the check ran in the same process as the
  // compile, pushing the build past the 8 GB build machine (SIGKILL on the
  // M7 production deploy). Locally the build still type-checks.
  typescript: { ignoreBuildErrors: process.env["VERCEL"] === "1" },
  experimental: {
    // The proxy buffers request bodies up to this size and cuts the rest.
    // Above the largest upload through our routes (a 25 MB Project
    // document on local disk, CM-414; deployed, those go straight to
    // Vercel Blob), so a cut body is still too large and refused rather
    // than stored truncated.
    proxyClientMaxBodySize: "26mb",
  },
  // Settings moved out of Masters to its own menu item: the Company profile
  // and the Advanced Settings now live under /app/settings. Team Members
  // left Masters for Users & Roles → Users (ADR CM-0030 §2).
  redirects: () =>
    Promise.resolve([
      {
        source: "/app/masters/company",
        destination: "/app/settings",
        permanent: true,
      },
      {
        source: "/app/masters/settings/:path*",
        destination: "/app/settings/:path*",
        permanent: true,
      },
      {
        source: "/app/masters/team-members/:path*",
        destination: "/app/users/:path*",
        permanent: true,
      },
    ]),
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Payslip and procurement PDFs embed Noto fonts read from node_modules at
  // run time (`src/shared-kernel/pdf/noto-text.ts`), which tracing cannot see.
  outputFileTracingIncludes: {
    "/api/construction/hrms/salaries/**/*": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    // Procurement PDFs (M5): Purchase Request, Purchase Order, Goods
    // Receipt and Material Request.
    "/api/construction/procurement/purchase-requests/**/*": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    "/api/construction/procurement/purchase-orders/**/*": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    "/api/construction/procurement/goods-receipts/[id]/pdf": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    "/api/construction/procurement/material-requests/[id]/pdf": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    // The Daily Progress Report (CM-606) renders inline when it is
    // generated or retried.
    "/api/construction/site-work/progress-reports": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    "/api/construction/site-work/progress-reports/[id]/retry": [
      "./node_modules/@expo-google-fonts/*/{400Regular,700Bold}/*.ttf",
    ],
    // A party payment's receipt (CM-705) prints the party's name in any
    // script.
    "/api/construction/finance/party-payments/[id]/receipt": [
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
