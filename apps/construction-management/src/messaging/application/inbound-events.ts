import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * The other modules' events messaging listens to, as messaging reads
 * them. A context never imports another's folder, so these are
 * structural copies of the fields used; the composition root checks they
 * stay assignable from the real events (`messaging-event-contracts.ts`).
 * The kernel's approval events are imported from the kernel directly.
 */

// Tracking (ADR CM-0019 §11).
export type InboundTaskAssigned = DomainEvent & {
  type: "TaskAssigned";
  taskId: string;
  projectId: string;
  taskNo: number;
  memberIds: readonly string[];
  by: string;
};

export type InboundTaskCompleted = DomainEvent & {
  type: "TaskCompleted";
  taskId: string;
  projectId: string;
  taskNo: number;
  by: string;
  createdBy: string;
  assigneeMemberIds: readonly string[];
};

type InboundIssueBase = DomainEvent & {
  issueId: string;
  projectId: string;
  number: string;
  createdBy: string;
  assigneeMemberId: string | null;
  by: string;
};

export type InboundIssueEvent =
  | (InboundIssueBase & { type: "IssueAssigned" })
  | (InboundIssueBase & { type: "IssueUpdated" })
  | (InboundIssueBase & { type: "IssueSolved" })
  | (InboundIssueBase & { type: "IssueReopened"; reason: string });

export type InboundInspectionRequested = DomainEvent & {
  type: "InspectionRequested";
  inspectionId: string;
  projectId: string;
  number: string;
  inspectorMemberId: string | null;
  requestedBy: string;
};

export type InboundInspectionDecided = DomainEvent & {
  type: "InspectionDecided";
  inspectionId: string;
  projectId: string;
  number: string;
  status: "approved" | "rejected";
  reason: string | null;
  decidedBy: string;
  requestedBy: string;
};

// Site work (ADR CM-0016).
export type InboundEquipmentFuelOverrun = DomainEvent & {
  type: "EquipmentFuelOverrun";
  sheetId: string;
  projectId: string;
  fuelQty: string;
  expectedFuelEfficiency: string;
  number?: string | null;
  by?: string;
};

// Procurement (ADR CM-0015).
type InboundLocation = { kind: string; id: string };

export type InboundStockBelowMinimum = DomainEvent & {
  type: "procurement.stock_below_minimum";
  locationKind: string;
  locationId: string;
  materialId: string;
  stock: string;
  minimum: string;
};

type InboundTransfer = DomainEvent & {
  transferId: string;
  number: string | null;
  from: InboundLocation;
  to: InboundLocation;
  by: string;
  createdBy: string;
};

export type InboundMaterialTransferSent = InboundTransfer & {
  type: "procurement.material_transfer_sent";
};

export type InboundMaterialTransferDelivered = InboundTransfer & {
  type: "procurement.material_transfer_delivered";
};

export type InboundMaterialRequestRaised = DomainEvent & {
  type: "procurement.material_request_raised";
  requestId: string;
  number: string | null;
  projectId: string;
  by: string;
};

export type InboundMaterialRequestDelivered = DomainEvent & {
  type: "procurement.material_request_delivered";
  requestId: string;
  number: string | null;
  projectId: string;
  requestedBy: string;
  by: string;
};

// HRMS.
export type InboundSalaryDecided = DomainEvent & {
  type: "hrms.salary_approved" | "hrms.salary_paid";
  month: string;
  slips: readonly { slipId: string; userId: string | null }[];
  by: string;
};

// Reporting (ADR CM-0021 §6).
export type InboundReportFinished = DomainEvent & {
  type: "ReportFinished";
  reportJobId: string;
  kind: string;
  projectId: string | null;
  requestedBy: string;
  status: "done" | "failed";
  fileName: string | null;
  error: string | null;
};

// Backups and data exports (CM-906, ADR CM-0021 §8).
export type InboundBackupFinished = DomainEvent & {
  type: "BackupFinished";
  backupJobId: string;
  scope: "project" | "masters" | "company" | "my_data";
  projectId: string | null;
  requestedBy: string;
  status: "done" | "failed";
  title: string;
  fileName: string | null;
  downloadHref: string | null;
  error: string | null;
};

// Sales (CM-1006, ADR CM-0022 §10).
type InboundBookingBase = DomainEvent & {
  bookingId: string;
  projectId: string;
  unitLabel: string;
  customerName: string;
  by: string;
};

export type InboundBookingEvent =
  | (InboundBookingBase & {
      type: "BookingCreated";
      status: "on_hold" | "booked";
    })
  | (InboundBookingBase & { type: "BookingConfirmed" })
  | (InboundBookingBase & { type: "BookingCancelled"; reason: string });

// Sales (CM-1004, ADR CM-0022 §10).
export type InboundInquiryAssigned = DomainEvent & {
  type: "InquiryAssigned";
  inquiryId: string;
  projectId: string;
  name: string;
  assigneeMemberId: string;
  by: string;
};

export type InboundImportedInquiriesAssigned = DomainEvent & {
  type: "ImportedInquiriesAssigned";
  projectId: string;
  assigneeMemberId: string;
  count: number;
  by: string;
};
