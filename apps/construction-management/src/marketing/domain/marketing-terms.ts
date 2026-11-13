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

/** Stored Visit states; Missed is worked out (ADR CM-0040 §7). */
export const VISIT_STATUSES = ["planned", "completed", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** What a list shows and filters by: the stored state, or Missed. */
export const VISIT_SHOWN_STATUSES = [
  "planned",
  "missed",
  "completed",
  "cancelled",
] as const;
export type VisitShownStatus = (typeof VISIT_SHOWN_STATUSES)[number];

export const VISIT_STATUS_LABELS: Record<VisitShownStatus, string> = {
  planned: "Planned",
  missed: "Missed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const VISIT_PURPOSES = [
  "cold_call",
  "introduction",
  "requirement_discussion",
  "quotation",
  "negotiation",
  "relationship",
  "payment_follow_up",
  "other",
] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  cold_call: "Cold call",
  introduction: "Introduction",
  requirement_discussion: "Requirement discussion",
  quotation: "Quotation",
  negotiation: "Negotiation",
  relationship: "Relationship",
  payment_follow_up: "Payment follow-up",
  other: "Other",
};

export const INTERESTS = ["hot", "warm", "cold"] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const WORK_TYPES = [
  "civil",
  "peb",
  "steel_fabrication",
  "shed_erection",
  "other",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  civil: "Civil",
  peb: "PEB",
  steel_fabrication: "Steel fabrication",
  shed_erection: "Shed erection",
  other: "Other",
};

/** Longest Visit texts, in characters. */
export const VISIT_LIMITS = {
  location: 300,
  discussion: 4000,
  outcome: 300,
  cancelReason: 300,
  note: 2000,
  /** ₹ 10,000 crore: an approximate value, not an amount to account for. */
  value: 100_000_000_000,
} as const;

/** A creator may change a Completed Visit for this long (ADR CM-0040 §7). */
export const VISIT_LOCK_DAYS = 7;

export const FOLLOW_UP_TYPES = [
  "call",
  "visit",
  "email",
  "send_quotation",
  "other",
] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export const FOLLOW_UP_TYPE_LABELS: Record<FollowUpType, string> = {
  call: "Call",
  visit: "Visit",
  email: "Email",
  send_quotation: "Send quotation",
  other: "Other",
};

export const FOLLOW_UP_STATUSES = ["open", "done", "cancelled"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  open: "Open",
  done: "Done",
  cancelled: "Cancelled",
};

/** An Open Follow-up's group on the Company's today (PRD §3.5). */
export const FOLLOW_UP_DUES = ["overdue", "today", "upcoming"] as const;
export type FollowUpDue = (typeof FOLLOW_UP_DUES)[number];

export const FOLLOW_UP_LIMITS = { note: 1000, resultNote: 1000 } as const;
