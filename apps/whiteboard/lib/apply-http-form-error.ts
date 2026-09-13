import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { QueryHttpError } from "@/src/queries/http";

const FIELD_BY_CODE: Record<string, string> = {
  EMAIL_INVALID: "email",
};

export function applyHttpFormError<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  fallback: string,
): void {
  if (!(error instanceof QueryHttpError)) {
    setError("root", { message: fallback });
    return;
  }
  const field = FIELD_BY_CODE[error.code];
  if (field != null) {
    setError(field as Path<TFieldValues>, { message: error.message });
    return;
  }
  setError("root", { message: error.message || fallback });
}
