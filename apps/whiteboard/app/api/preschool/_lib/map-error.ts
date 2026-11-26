import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { PreschoolError } from "@/src/preschool/domain/errors";

const STATUS = {
  not_found: StatusCodes.NOT_FOUND,
  conflict: StatusCodes.CONFLICT,
  forbidden: StatusCodes.FORBIDDEN,
  invalid: StatusCodes.BAD_REQUEST,
} as const;

/** A Preschool rule answers with its own status; anything else as the shared mapper does. */
export function mapPreschoolError(error: unknown): Response {
  if (error instanceof PreschoolError)
    return jsonError(
      STATUS[error.kind],
      error.code,
      error.message,
      error.details,
    );
  return mapError(error);
}

export { parseOrThrow };
