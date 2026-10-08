import { QueryHttpError } from "@/src/queries/http";

/**
 * A server error code shown under the field it is about; anything else is a
 * form-level message. Domain codes come from the API envelope (root ADR-0017).
 */
export function fieldForCode<Field extends string>(
  error: unknown,
  fields: Partial<Record<string, Field>>,
): { field: Field | null; message: string } {
  if (error instanceof QueryHttpError) {
    const field = fields[error.code] ?? null;
    return { field, message: error.message };
  }
  return { field: null, message: "Something went wrong. Please try again." };
}
