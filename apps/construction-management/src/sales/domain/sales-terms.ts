/**
 * The sales context's fixed words (ADR CM-0022), in the order screens show
 * them. Values match the `construction_sales` enums.
 */

export const INTEREST_TYPES = ["hot", "warm", "cold"] as const;
export type InterestType = (typeof INTEREST_TYPES)[number];
export const INTEREST_TYPE_LABELS: Record<InterestType, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const INQUIRY_STATUSES = ["open", "converted", "lost"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];
export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  open: "Open",
  converted: "Converted",
  lost: "Lost",
};

/** The list's next follow-up filter (CM-0022 §4). Derived, never stored. */
export const FOLLOW_UP_DUES = ["overdue", "today", "upcoming", "none"] as const;
export type FollowUpDue = (typeof FOLLOW_UP_DUES)[number];
export const FOLLOW_UP_DUE_LABELS: Record<FollowUpDue, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No follow-up",
};

export const INQUIRY_EVENT_TYPES = [
  "created",
  "assigned",
  "lead_owner_changed",
  "stage_moved",
  "converted",
  "lost",
  "reopened",
] as const;
export type InquiryEventType = (typeof INQUIRY_EVENT_TYPES)[number];

export const FOLLOW_UP_ACTIVITIES = [
  "call",
  "site_visit",
  "meeting",
  "whatsapp",
  "email",
  "other",
] as const;
export type FollowUpActivity = (typeof FOLLOW_UP_ACTIVITIES)[number];
export const FOLLOW_UP_ACTIVITY_LABELS: Record<FollowUpActivity, string> = {
  call: "Call",
  site_visit: "Site visit",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  email: "Email",
  other: "Other",
};

export const INQUIRY_TASK_STATUSES = ["open", "done"] as const;
export type InquiryTaskStatus = (typeof INQUIRY_TASK_STATUSES)[number];

export const UNAVAILABLE_REASONS = [
  "landowner_share",
  "reserved",
  "not_for_sale",
  "other",
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];
export const UNAVAILABLE_REASON_LABELS: Record<UnavailableReason, string> = {
  landowner_share: "Landowner share",
  reserved: "Reserved",
  not_for_sale: "Not for sale",
  other: "Other",
};

export const AREA_UNITS = ["sq_ft", "sq_m"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];
export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sq_ft: "sq ft",
  sq_m: "sq m",
};

/** Stored booking states (CM-0022 §7). */
export const BOOKING_STATUSES = ["on_hold", "booked", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  on_hold: "On Hold",
  booked: "Booked",
  cancelled: "Cancelled",
};
/** The statuses that hold a unit: at most one live booking per unit. */
export const ACTIVE_BOOKING_STATUSES = ["on_hold", "booked"] as const;

/**
 * A unit's sales status, derived (CM-0022 §7, §8): Unavailable when its
 * profile says so, else its active booking's status, else Available. A hold
 * past its hold-until date counts as Available.
 */
export const UNIT_SALES_STATUSES = [
  "available",
  "on_hold",
  "booked",
  "unavailable",
] as const;
export type UnitSalesStatus = (typeof UNIT_SALES_STATUSES)[number];
export const UNIT_SALES_STATUS_LABELS: Record<UnitSalesStatus, string> = {
  available: "Available",
  on_hold: "On Hold",
  booked: "Booked",
  unavailable: "Unavailable",
};

/** The reason recorded when rebooking cancels an expired hold. */
export const HOLD_EXPIRED_REASON = "Hold expired";
/** `actor_user_id` of history rows the system wrote. */
export const SYSTEM_ACTOR = "system";

/** Field limits shared by forms, imports and the HTTP models. */
export const SALES_LIMITS = {
  listName: 60,
  name: 120,
  unitType: 60,
  occupation: 120,
  address: 500,
  remarks: 2_000,
  cancelReason: 500,
  taskTitle: 200,
  referredBy: 120,
  inquiryImportRows: 1_000,
  unitImportRows: 2_000,
} as const;

/**
 * Normalises a mobile number (CM-0022 §3): ten digits (optionally after 0
 * or 91) become `+91…`; otherwise `+` and 8–15 digits. Spaces, dashes and
 * brackets are ignored. Null when it is not a phone number.
 */
export function normaliseMobile(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  const digits = compact.replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return normaliseMobile(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91"))
    return normaliseMobile(digits.slice(2));
  return null;
}
