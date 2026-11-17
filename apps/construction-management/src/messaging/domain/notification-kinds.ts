import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import { pageHref } from "@/lib/page-href";

/**
 * The notifications M9 delivers (ADR CM-0021 §6): each type, the menu
 * whose Notification flag gates it and the flag it needs besides
 * (Approve for "waiting for your approval", Read for the rest). A type
 * with no menu ("ready") goes to its requester only and needs no flag.
 * Titles and bodies are plain words; links are paths inside the app.
 */

export type NotificationKind = {
  /** Null: the menu comes from the document (approvals) or none at all. */
  menu: MenuKey | null;
  flag: Flag | null;
};

export const NOTIFICATION_KINDS = {
  // Reports, backups, exports: the requester only, no flag.
  "report.ready": { menu: null, flag: null },
  "report.failed": { menu: null, flag: null },
  "backup.ready": { menu: null, flag: null },
  "backup.failed": { menu: null, flag: null },
  "export.ready": { menu: null, flag: null },
  "export.failed": { menu: null, flag: null },
  // Tracking.
  "task.assigned": { menu: "tracking.tasks", flag: "read" },
  "task.completed": { menu: "tracking.tasks", flag: "read" },
  "task.delayed": { menu: "tracking.tasks", flag: "read" },
  "issue.assigned": { menu: "tracking.issues", flag: "read" },
  "issue.updated": { menu: "tracking.issues", flag: "read" },
  "issue.solved": { menu: "tracking.issues", flag: "read" },
  "issue.reopened": { menu: "tracking.issues", flag: "read" },
  "issue.delayed": { menu: "tracking.issues", flag: "read" },
  "inspection.requested": {
    menu: "tracking.inspection_requests",
    flag: "read",
  },
  "inspection.decided": { menu: "tracking.inspection_requests", flag: "read" },
  // Approvals of any document: the menu comes from `APPROVAL_DOCUMENTS`.
  "approval.requested": { menu: null, flag: "approve" },
  "approval.decided": { menu: null, flag: "read" },
  // Site work.
  "equipment.fuel_overrun": { menu: "site_work.equipment_usage", flag: "read" },
  // Materials and the Central Store.
  "material_transfer.sent": {
    menu: "procurement.material_transfers",
    flag: "read",
  },
  "material_transfer.delivered": {
    menu: "procurement.material_transfers",
    flag: "read",
  },
  "material_request.raised": {
    menu: "procurement.material_requests",
    flag: "read",
  },
  "material_request.delivered": {
    menu: "procurement.material_requests",
    flag: "read",
  },
  "stock.below_minimum": {
    menu: "procurement.current_inventory",
    flag: "read",
  },
  // HRMS.
  "salary.approved": { menu: "hrms.salaries", flag: "read" },
  "salary.paid": { menu: "hrms.salaries", flag: "read" },
  // Sales (CM-1006): Booking Read + Notification holders on the Project.
  "booking.created": { menu: "sales.bookings", flag: "read" },
  "booking.confirmed": { menu: "sales.bookings", flag: "read" },
  "booking.cancelled": { menu: "sales.bookings", flag: "read" },
  // Sales (CM-1004, ADR CM-0022 §10).
  "inquiry.assigned": { menu: "sales.inquiries", flag: "read" },
  "inquiry.follow_ups_due": { menu: "sales.inquiries", flag: "read" },
  // Marketing (ADR CM-0040 §8): to a Follow-up's owner only.
  "marketing.follow_up_due": { menu: "marketing.follow_ups", flag: "read" },
  "marketing.follow_up_overdue": {
    menu: "marketing.follow_ups",
    flag: "read",
  },
} as const satisfies Record<string, NotificationKind>;

export type NotificationType = keyof typeof NOTIFICATION_KINDS;

/** Types that carry a download and raise the "ready" toast. */
export const READY_TYPES: readonly NotificationType[] = [
  "report.ready",
  "backup.ready",
  "export.ready",
];

// ---------------------------------------------------------------------------
// Documents with an approval step (`document.submitted|approved|rejected`)
// ---------------------------------------------------------------------------

type DocumentRef = { id: string; projectId: string | null };

export type ApprovalDocument = {
  menu: MenuKey;
  /** As screens name it: "Purchase Request". */
  label: string;
  /** Where an approver acts on it. */
  approverHref: (document: DocumentRef) => string | null;
  /** Where its creator (or the employee) reads the decision. */
  creatorHref: (document: DocumentRef) => string | null;
  /**
   * Without a Project (at a Store), only the Owner may approve it, so only
   * the Owner is asked to.
   */
  ownerOnlyWithoutProject?: boolean;
};

/**
 * A link inside the document's Project, built with pageHref so a moved page
 * fails check-types (ADR CM-0045). None at a Store.
 */
function inProject(href: (projectId: string, documentId: string) => string) {
  return (document: DocumentRef): string | null =>
    document.projectId == null ? null : href(document.projectId, document.id);
}

function same(href: (document: DocumentRef) => string | null) {
  return { approverHref: href, creatorHref: href };
}

/**
 * Each document type a module raises approval events for, with its menu
 * and links. Material Transfers and Delivery Notes are announced by their
 * own events (sent, delivered), so their approvals are not listed.
 */
export const APPROVAL_DOCUMENTS: Record<string, ApprovalDocument> = {
  worksheet: {
    menu: "site_work.daily_worksheet",
    label: "Daily Worksheet",
    ...same(
      inProject((id, worksheetId) =>
        pageHref("/app/projects/[id]/worksheets/[worksheetId]", {
          id,
          worksheetId,
        }),
      ),
    ),
  },
  equipment_usage: {
    menu: "site_work.equipment_usage",
    label: "Equipment Usage sheet",
    ...same(
      inProject((id, sheetId) =>
        pageHref("/app/projects/[id]/equipment/usage-sheets/[sheetId]", {
          id,
          sheetId,
        }),
      ),
    ),
  },
  purchase_request: {
    menu: "procurement.purchase_requests",
    label: "Purchase Request",
    ...same(
      inProject((id, prId) =>
        pageHref("/app/projects/[id]/materials/purchase-requests/[prId]", {
          id,
          prId,
        }),
      ),
    ),
  },
  purchase_order: {
    menu: "procurement.purchase_orders",
    label: "Purchase Order",
    ...same(
      inProject((id, poId) =>
        pageHref("/app/projects/[id]/materials/purchase-orders/[poId]", {
          id,
          poId,
        }),
      ),
    ),
  },
  transaction: {
    menu: "finance.transactions",
    label: "Transaction",
    ...same(
      inProject((id, transactionId) =>
        pageHref("/app/projects/[id]/payments/transactions/[transactionId]", {
          id,
          transactionId,
        }),
      ),
    ),
  },
  petty_cash_voucher: {
    menu: "finance.petty_cash",
    label: "Petty Cash voucher",
    ...same(
      inProject((id, voucherId) =>
        pageHref("/app/projects/[id]/payments/petty-cash/[voucherId]", {
          id,
          voucherId,
        }),
      ),
    ),
  },
  invoice_settlement: {
    menu: "finance.parties",
    label: "Invoice settlement",
    ...same(inProject((id) => pageHref("/app/projects/[id]/payments", { id }))),
    // A Store's supplier invoices are the Owner's alone (`canOnPlace`).
    ownerOnlyWithoutProject: true,
  },
  other_expense: {
    menu: "finance.other_expenses",
    label: "Other Expense",
    ...same(
      inProject((id, expenseId) =>
        pageHref("/app/projects/[id]/payments/other-expenses/[expenseId]", {
          id,
          expenseId,
        }),
      ),
    ),
  },
  leave_request: {
    menu: "hrms.leaves",
    label: "Leave request",
    approverHref: () => "/app/hrms/leave/approvals",
    creatorHref: () => "/app/hrms/leave/my",
  },
  leave_cancellation: {
    menu: "hrms.leaves",
    label: "Leave cancellation",
    approverHref: () => "/app/hrms/leave/approvals",
    creatorHref: () => "/app/hrms/leave/my",
  },
  attendance_correction: {
    menu: "hrms.attendance",
    label: "Attendance correction",
    approverHref: () => "/app/hrms/attendance/approvals",
    creatorHref: () => "/app/hrms/attendance/my",
  },
};

export function approvalDocument(
  documentType: string,
): ApprovalDocument | null {
  return APPROVAL_DOCUMENTS[documentType] ?? null;
}

/** "Purchase Request PR-0012", or "A Purchase Request" without a number. */
export function documentName(label: string, number: string | null): string {
  return number == null || number === "" ? `A ${label}` : `${label} ${number}`;
}

// ---------------------------------------------------------------------------
// Links to records
// ---------------------------------------------------------------------------

export const LINKS = {
  notifications: "/app/notifications",
  downloads: "/app/downloads",
  task: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/tasks/[taskId]", {
      id: projectId,
      taskId: id,
    }),
  issue: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/issues/[issueId]", {
      id: projectId,
      issueId: id,
    }),
  inspection: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/inspections/[inspectionId]", {
      id: projectId,
      inspectionId: id,
    }),
  equipmentSheet: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/equipment/usage-sheets/[sheetId]", {
      id: projectId,
      sheetId: id,
    }),
  transfer: (
    location: { kind: string; id: string },
    transferId: string,
  ): string =>
    location.kind === "project"
      ? pageHref("/app/projects/[id]/materials/transfers/[transferId]", {
          id: location.id,
          transferId,
        })
      : pageHref("/app/workspace/central-store/[id]/transfers/[transferId]", {
          id: location.id,
          transferId,
        }),
  centralMaterialRequest: (id: string) =>
    pageHref("/app/workspace/central-store/material-requests/[id]", { id }),
  projectMaterialRequest: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/materials/material-requests/[requestId]", {
      id: projectId,
      requestId: id,
    }),
  inventory: (location: { kind: string; id: string }): string =>
    location.kind === "project"
      ? pageHref("/app/projects/[id]/materials/inventory", { id: location.id })
      : pageHref("/app/workspace/central-store/[id]", { id: location.id }),
  mySalary: "/app/hrms/salary/my",
  // Sales (CM-1006)
  booking: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/bookings/list/[bookingId]", {
      id: projectId,
      bookingId: id,
    }),
  // Sales (CM-1004)
  inquiry: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/inquiries/list/[inquiryId]", {
      id: projectId,
      inquiryId: id,
    }),
  inquiries: (projectId: string) =>
    pageHref("/app/projects/[id]/inquiries/list", { id: projectId }),
  inquiriesDue: (projectId: string, due: "overdue" | "today") =>
    pageHref(
      "/app/projects/[id]/inquiries/list",
      { id: projectId },
      `?due=${due}`,
    ),
} as const;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-09" → "September 2026". */
export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  const name = MONTHS[Number(number) - 1];
  return name == null || year == null ? month : `${name} ${year}`;
}

const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

/** "2026-10-15" → "15 Oct 2026". */
export function dateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  const name = SHORT_MONTHS[Number(month) - 1];
  if (year == null || name == null || day == null) return date;
  return `${String(Number(day))} ${name} ${year}`;
}

/** "Task #12" or "Task #12 — Shuttering, 2nd floor". */
export function taskName(taskNo: number, title: string | null): string {
  return title == null || title === ""
    ? `Task #${String(taskNo)}`
    : `Task #${String(taskNo)} — ${title}`;
}
