import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import {
  DomainError,
  type DomainErrorKind,
} from "@/src/shared-kernel/domain-error";

import { jsonError } from "./json-error";

const STATUS_BY_KIND: Record<DomainErrorKind, StatusCodes> = {
  invalid: StatusCodes.BAD_REQUEST,
  not_found: StatusCodes.NOT_FOUND,
  conflict: StatusCodes.CONFLICT,
  forbidden: StatusCodes.FORBIDDEN,
  limit: StatusCodes.PAYMENT_REQUIRED,
};

/** Any thrown value as the `{ code, message, details? }` envelope (root ADR-0017). */
export function mapError(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return jsonError(
      StatusCodes.BAD_REQUEST,
      "VALIDATION_ERROR",
      "Invalid JSON body.",
    );
  }
  if (error instanceof z.ZodError) {
    return jsonError(
      StatusCodes.BAD_REQUEST,
      "VALIDATION_ERROR",
      "Invalid request.",
      z.treeifyError(error),
    );
  }
  if (error instanceof DomainError) {
    return jsonError(
      STATUS_BY_KIND[error.kind],
      error.code,
      error.message,
      error.details,
    );
  }
  console.error(error);
  return jsonError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    "INTERNAL_ERROR",
    "Something went wrong.",
  );
}

export function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
): T {
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
