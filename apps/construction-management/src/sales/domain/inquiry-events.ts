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

/**
 * An import (CM-1007) assigned `count` new inquiries of the Project to
 * one Team Member: one summary notice instead of one per row. Not raised
 * for the importer's own rows.
 */
export type ImportedInquiriesAssigned = DomainEvent & {
  type: "ImportedInquiriesAssigned";
  projectId: string;
  /** The Assignee (a Team Member id). */
  assigneeMemberId: string;
  count: number;
  /** User id of who imported them. */
  by: string;
};

export type InquiryEvent = InquiryAssigned | ImportedInquiriesAssigned;
