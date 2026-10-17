import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * Events the inquiries raise after commit (CM-1003, ADR CM-0022 §10).
 * Messaging turns `InquiryAssigned` into `inquiry.assigned` for the new
 * assignee, unless they assigned it themselves.
 */
export type InquiryAssigned = DomainEvent & {
  type: "InquiryAssigned";
  inquiryId: string;
  projectId: string;
  /** The lead's name, for the notification's title. */
  name: string;
  /** The new Assignee (a Team Member id). */
  assigneeMemberId: string;
  /** User id of who assigned it. */
  by: string;
};

export type InquiryEvent = InquiryAssigned;
