import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

/** A field the form shows the message under. */
export function invalidField(
  code: string,
  message: string,
  field: string,
): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/**
 * Another Company's, a deleted one, or one the caller may not see (ADR
 * CM-0040 §5): the same 404, so its existence is not confirmed.
 */
export function prospectCompanyNotFound(): DomainError {
  return notFound(
    "PROSPECT_COMPANY_NOT_FOUND",
    "This Prospect Company was not found.",
  );
}

export function contactNotFound(): DomainError {
  return notFound("CONTACT_NOT_FOUND", "This Contact was not found.");
}

/** The name is taken by a live company, whoever it is assigned to. */
export function prospectCompanyNameInUse(): DomainError {
  return new DomainError(
    "PROSPECT_COMPANY_NAME_IN_USE",
    "A Prospect Company with this name already exists.",
    { kind: "conflict", details: { field: "name" } },
  );
}

/** Someone saved the record after the caller opened it. */
export function prospectCompanyChanged(): DomainError {
  return conflict(
    "PROSPECT_COMPANY_CHANGED",
    "Someone else changed this Prospect Company. Reload it and try again.",
  );
}

export function marketingPersonNotFound(field: string): DomainError {
  return invalidField(
    "MARKETING_PERSON_NOT_FOUND",
    "Choose an active Marketing Person.",
    field,
  );
}

export function prospectCompanyHasVisits(): DomainError {
  return conflict(
    "PROSPECT_COMPANY_HAS_VISITS",
    "This Prospect Company has Visits, so it cannot be deleted.",
  );
}
