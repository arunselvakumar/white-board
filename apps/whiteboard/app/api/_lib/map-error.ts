import { z } from "zod";

import { InvalidCursorError } from "@/src/todo/application/invalid-cursor-error";
import { TodoNotFoundError } from "@/src/todo/application/not-found-error";
import { DomainError } from "@/src/todo/domain/errors";

import { jsonError } from "./json-error";

export function mapError(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return jsonError(400, "VALIDATION_ERROR", "Invalid JSON body.");
  }
  if (error instanceof z.ZodError) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Invalid request.",
      z.treeifyError(error),
    );
  }
  if (error instanceof InvalidCursorError) {
    return jsonError(400, error.code, error.message);
  }
  if (error instanceof TodoNotFoundError) {
    return jsonError(404, error.code, error.message);
  }
  if (error instanceof DomainError) {
    if (error.code === "TODO_ALREADY_COMPLETED") {
      return jsonError(409, error.code, error.message);
    }
    return jsonError(400, error.code, error.message);
  }
  console.error(error);
  return jsonError(500, "INTERNAL_ERROR", "Something went wrong.");
}

export function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
): T {
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
