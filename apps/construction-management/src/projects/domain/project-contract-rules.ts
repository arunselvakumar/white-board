/**
 * Limits for a Project's contract details and custom fields (CM-413,
 * ADR CM-0010). Every field is optional; the form and the domain share
 * these numbers.
 */
export const PROJECT_CLIENT_NAME_MAX = 120;
/** Tender ref., Quotation No., LOA No., PO / WO No., Agreement No. */
export const PROJECT_REFERENCE_MAX = 60;
/** ₹1,000 crore in paise; a guard against typos, not a business rule. */
export const PROJECT_ORDER_VALUE_MAX = 1_000_00_00_000 * 100;
/**
 * The Project's Budget (CM-401) is the Company's own figure, not a contract
 * paper, but it has the same guard and the same Financial rule as the
 * Order Value.
 */
export const PROJECT_BUDGET_MAX = PROJECT_ORDER_VALUE_MAX;

export const PROJECT_CUSTOM_FIELDS_MAX = 20;
export const PROJECT_CUSTOM_FIELD_LABEL_MAX = 60;
export const PROJECT_CUSTOM_FIELD_VALUE_MAX = 500;

/** The reference-number fields, in the order the papers happen. */
export const PROJECT_REFERENCE_FIELDS = [
  "tenderRef",
  "quotationNo",
  "loaNo",
  "clientOrderNo",
  "agreementNo",
] as const;

export type ProjectReferenceField = (typeof PROJECT_REFERENCE_FIELDS)[number];

/** The dated papers: each has a number field and a date field. */
export const PROJECT_DATE_FIELDS = [
  "quotationDate",
  "loaDate",
  "clientOrderDate",
  "agreementDate",
] as const;

export type ProjectDateField = (typeof PROJECT_DATE_FIELDS)[number];
