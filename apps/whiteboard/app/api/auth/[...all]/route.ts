import { authRouteHandlers } from "@repo/auth/server";

/** Better Auth's HTTP API at `/api/auth/*` (ADR-0034, ADR-0035). */
export const { GET, POST } = authRouteHandlers;
