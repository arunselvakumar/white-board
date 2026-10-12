import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

/**
 * Payment Categories (Masters → Payment Categories, `masters.payment_categories`,
 * ADR CM-0017 §1): a name the money forms pick. Each Company gets the seed
 * list; any category may be disabled (off the pickers, old documents keep
 * it); a seed is never deleted; a category a document or account entry
 * names cannot be deleted.
 */

export const PAYMENT_CATEGORY_NAME_MAX = 100;

/** Trimmed; 400 `PAYMENT_CATEGORY_NAME_REQUIRED` / `_TOO_LONG`. */
export function paymentCategoryName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(
      "PAYMENT_CATEGORY_NAME_REQUIRED",
      "Enter the category's name.",
      { details: { field: "name" } },
    );
  if (name.length > PAYMENT_CATEGORY_NAME_MAX)
    throw new DomainError(
      "PAYMENT_CATEGORY_NAME_TOO_LONG",
      `Use at most ${String(PAYMENT_CATEGORY_NAME_MAX)} characters.`,
      { details: { field: "name" } },
    );
  return name;
}

export function paymentCategoryNotFound(): DomainError {
  return notFound(
    "PAYMENT_CATEGORY_NOT_FOUND",
    "This Payment Category was not found.",
  );
}

export function paymentCategoryNameTaken(): DomainError {
  return conflict(
    "PAYMENT_CATEGORY_NAME_TAKEN",
    "A Payment Category with this name already exists.",
    { field: "name" },
  );
}

export function paymentCategoryChanged(): DomainError {
  return conflict(
    "PAYMENT_CATEGORY_CHANGED",
    "Someone else changed this Payment Category after you opened it. Reload to see their changes.",
  );
}

export function paymentCategoryInUse(): DomainError {
  return conflict(
    "PAYMENT_CATEGORY_IN_USE",
    "Payments, vouchers or expenses use this Payment Category, so it cannot be deleted. Disable it instead.",
  );
}

export function paymentCategorySeed(): DomainError {
  return conflict(
    "PAYMENT_CATEGORY_SEED",
    "This Payment Category came with the app, so it cannot be deleted. Disable it instead.",
  );
}
