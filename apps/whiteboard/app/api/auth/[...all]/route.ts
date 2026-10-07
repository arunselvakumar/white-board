import { authRouteHandlers } from "@repo/auth/server";

/** Better Auth's HTTP API at `/app/api/auth/*` (ADR-0034). */
export const { GET, POST } = authRouteHandlers;
