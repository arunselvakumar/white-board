import type { Flag, MenuKey } from "@/src/shared-kernel/access";

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

function inProject(path: string) {
  return (document: DocumentRef): string | null =>
    document.projectId == null
      ? null
      : `/app/projects/${document.projectId}/${path}/${document.id}`;
}

function projectPage(path: string) {
  return (document: DocumentRef): string | null =>
    document.projectId == null
      ? null
      : `/app/projects/${document.projectId}/${path}`;
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
    ...same(inProject("worksheets")),
  },
  equipment_usage: {
    menu: "site_work.equipment_usage",
    label: "Equipment Usage sheet",
    ...same(inProject("equipment/usage-sheets")),
  },
  purchase_request: {
    menu: "procurement.purchase_requests",
    label: "Purchase Request",
    ...same(inProject("materials/purchase-requests")),
  },
  purchase_order: {
    menu: "procurement.purchase_orders",
    label: "Purchase Order",
    ...same(inProject("materials/purchase-orders")),
  },
  transaction: {
    menu: "finance.transactions",
    label: "Transaction",
    ...same(inProject("payments/transactions")),
  },
  petty_cash_voucher: {
    menu: "finance.petty_cash",
    label: "Petty Cash voucher",
    ...same(inProject("payments/petty-cash")),
  },
  invoice_settlement: {
    menu: "finance.parties",
    label: "Invoice settlement",
    ...same(projectPage("payments")),
    // A Store's supplier invoices are the Owner's alone (`canOnPlace`).
    ownerOnlyWithoutProject: true,
  },
  other_expense: {
    menu: "finance.other_expenses",
    label: "Other Expense",
    ...same(inProject("payments/other-expenses")),
  },
  // Contracts (CM-1103): a BOQ Variation, decided on the BOQ's Variations tab.
  variation: {
    menu: "contracts.boq",
    label: "Variation",
    ...same((document: DocumentRef): string | null =>
      document.projectId == null
        ? null
        : `/app/projects/${document.projectId}/boq?tab=variations`,
    ),
  },
  leave_request: {
    menu: "hrms.leaves",
    label: "Leave request",
    approverHref: () => "/app/workspace/hrms/leave/approvals",
    creatorHref: () => "/app/workspace/hrms/leave/my",
  },
  leave_cancellation: {
    menu: "hrms.leaves",
    label: "Leave cancellation",
    approverHref: () => "/app/workspace/hrms/leave/approvals",
    creatorHref: () => "/app/workspace/hrms/leave/my",
  },
  attendance_correction: {
    menu: "hrms.attendance",
    label: "Attendance correction",
    approverHref: () => "/app/workspace/hrms/attendance/approvals",
    creatorHref: () => "/app/workspace/hrms/attendance/my",
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
    `/app/projects/${projectId}/tasks/${id}`,
  issue: (projectId: string, id: string) =>
    `/app/projects/${projectId}/issues/${id}`,
  inspection: (projectId: string, id: string) =>
    `/app/projects/${projectId}/inspections/${id}`,
  equipmentSheet: (projectId: string, id: string) =>
    `/app/projects/${projectId}/equipment/usage-sheets/${id}`,
  transfer: (
    location: { kind: string; id: string },
    transferId: string,
  ): string =>
    location.kind === "project"
      ? `/app/projects/${location.id}/materials/transfers/${transferId}`
      : `/app/workspace/central-store/${location.id}/transfers/${transferId}`,
  centralMaterialRequest: (id: string) =>
    `/app/workspace/central-store/material-requests/${id}`,
  projectMaterialRequest: (projectId: string, id: string) =>
    `/app/projects/${projectId}/materials/material-requests/${id}`,
  inventory: (location: { kind: string; id: string }): string =>
    location.kind === "project"
      ? `/app/projects/${location.id}/materials/inventory`
      : `/app/workspace/central-store/${location.id}`,
  mySalary: "/app/workspace/hrms/salary/my",
  // Sales (CM-1006)
  booking: (projectId: string, id: string) =>
    `/app/projects/${projectId}/bookings/list/${id}`,
  // Sales (CM-1004)
  inquiry: (projectId: string, id: string) =>
    `/app/projects/${projectId}/inquiries/list/${id}`,
  inquiries: (projectId: string) => `/app/projects/${projectId}/inquiries/list`,
  inquiriesDue: (projectId: string, due: "overdue" | "today") =>
    `/app/projects/${projectId}/inquiries/list?due=${due}`,
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
