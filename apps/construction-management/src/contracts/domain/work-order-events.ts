import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * Raised after commit when a Work Order is approved and so issued
 * (CM-1104, ADR CM-0023 §5). Messaging turns it into `work_order.issued`
 * for the Work Order Read + Notification holders on the Project
 * (`src/messaging/application/inbound-events.ts` keeps a copy). Its
 * approval itself is announced by the generic `document.approved`.
 */
export type WorkOrderIssued = DomainEvent & {
  type: "WorkOrderIssued";
  workOrderId: string;
  projectId: string;
  number: string;
  contractorName: string;
  /** User id of the approver; never told. */
  by: string;
};
