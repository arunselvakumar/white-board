/**
 * Marketing's fixed lists (ADR CM-0040 §11; PRD §4: not editable in this
 * round) and the words screens show for them.
 */

export const STAGES = [
  "new",
  "contacted",
  "requirement_received",
  "quotation_sent",
  "negotiation",
  "won",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  requirement_received: "Requirement received",
  quotation_sent: "Quotation sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

/** The Stages a person moves a company to; New and Contacted are the system's. */
export const MANUAL_STAGES = [
  "requirement_received",
  "quotation_sent",
  "negotiation",
  "won",
  "lost",
] as const satisfies readonly Stage[];
export type ManualStage = (typeof MANUAL_STAGES)[number];

export const LOST_REASONS = [
  "price",
  "competitor",
  "no_requirement",
  "not_reachable",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  competitor: "Went to a competitor",
  no_requirement: "No requirement now",
  not_reachable: "Not reachable",
  other: "Other",
};

export const COMPANY_SOURCES = [
  "reference",
  "cold_call",
  "tender_notice",
  "existing_client",
  "exhibition",
  "online",
  "other",
] as const;
export type CompanySource = (typeof COMPANY_SOURCES)[number];

export const COMPANY_SOURCE_LABELS: Record<CompanySource, string> = {
  reference: "Reference",
  cold_call: "Cold call",
  tender_notice: "Tender notice",
  existing_client: "Existing client",
  exhibition: "Exhibition",
  online: "Online",
  other: "Other",
};

/** Longest value of each text field, in characters. */
export const MARKETING_LIMITS = {
  name: 120,
  industry: 60,
  address: 500,
  city: 60,
  phone: 20,
  email: 254,
  website: 200,
  remarks: 1000,
  lostReasonText: 300,
  jobTitle: 80,
} as const;
