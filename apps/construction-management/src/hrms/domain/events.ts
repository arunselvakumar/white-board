import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * HRMS events raised after commit (CM-904, ADR CM-0021 §6). Leave
 * requests, leave cancellations and attendance corrections raise the
 * shared-kernel approval events (`document.submitted`, `.approved`,
 * `.rejected`) with these document types; `createdBy` there is the
 * employee's User (null when the Team Member has none) and `projectId`
 * is always null.
 */
export const HRMS_DOCUMENT_TYPES = {
  leaveRequest: "leave_request",
  leaveCancellation: "leave_cancellation",
  attendanceCorrection: "attendance_correction",
} as const;

/** One salary slip a salary event is about, and the employee to tell. */
export type SalarySlipRecipient = {
  slipId: string;
  /** The employee's User id; null when the Team Member has none. */
  userId: string | null;
};

/** Salary slips of a month were approved. */
export type SalaryApproved = DomainEvent & {
  type: "hrms.salary_approved";
  /** "YYYY-MM". */
  month: string;
  slips: SalarySlipRecipient[];
  /** User id of who approved them; never notified of it. */
  by: string;
};

/** Salary slips of a month were marked paid. */
export type SalaryPaid = DomainEvent & {
  type: "hrms.salary_paid";
  /** "YYYY-MM". */
  month: string;
  slips: SalarySlipRecipient[];
  /** User id of who marked them paid; never notified of it. */
  by: string;
};

export type HrmsEvent = SalaryApproved | SalaryPaid;
