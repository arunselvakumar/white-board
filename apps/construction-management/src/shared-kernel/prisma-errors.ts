import type { Prisma } from "@repo/construction-db";

/**
 * Whether `error` is Prisma's known request error with this code
 * (https://www.prisma.io/docs/orm/reference/error-reference).
 *
 * Checks the name and code, never `instanceof`: under `next dev --webpack`
 * every route bundles its own copy of the generated client, while the one
 * dev PrismaClient lives on `globalThis` (`@repo/construction-db`). Its
 * errors are then built by another copy's class, `instanceof` is false, and
 * a "name in use" conflict surfaced as a 500 (#98).
 */
export function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    (error as { code?: unknown }).code === code
  );
}

/** A unique index refused the write (Prisma P2002). */
export function isUniqueViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return isPrismaError(error, "P2002");
}
