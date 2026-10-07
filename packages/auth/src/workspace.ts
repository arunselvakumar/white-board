/**
 * Institution Types a Workspace Creation can choose today (ADR-0025,
 * ADR-0034). The full catalog, with the coming-soon types, lives in the app's
 * `lib/institution-type.ts`; only these are accepted by the auth server.
 */
export const AVAILABLE_INSTITUTION_TYPES = ["training_institute"] as const;

export type AvailableInstitutionType =
  (typeof AVAILABLE_INSTITUTION_TYPES)[number];

export function isInstitutionType(
  value: unknown,
): value is AvailableInstitutionType {
  return (
    typeof value === "string" &&
    (AVAILABLE_INSTITUTION_TYPES as readonly string[]).includes(value)
  );
}
