import { QueryHttpError } from "@/src/queries/http";

/** The server's ErrorEnvelope message, else a friendly fallback. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof QueryHttpError) return error.message || fallback;
  return fallback;
}
