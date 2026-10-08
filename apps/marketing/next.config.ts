import type { NextConfig } from "next";

const WHITEBOARD_ORIGIN =
  process.env["NEXT_PUBLIC_WHITEBOARD_URL"] ?? "https://app.white-board.io";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui"],
  // Whiteboard moved from white-board.io/app to its own host (ADR-0035).
  redirects() {
    return Promise.resolve([
      {
        source: "/app",
        destination: `${WHITEBOARD_ORIGIN}/`,
        permanent: false,
      },
      {
        source: "/app/:path*",
        destination: `${WHITEBOARD_ORIGIN}/:path*`,
        permanent: false,
      },
    ]);
  },
};

export default nextConfig;
