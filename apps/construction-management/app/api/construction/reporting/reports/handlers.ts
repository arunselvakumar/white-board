import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import type { ReportKind, ReportJob } from "@/src/reporting/domain/report-job";
import { createReportJobs } from "@/src/composition/report-jobs";
import {
  canBeCentral,
  hasOwnModule,
  isFinanceReport,
  REPORT_KINDS,
} from "@/src/reporting/domain/report-job";
import {
  can,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/** One set of report handlers for every route (CM-217, CM-218). */
export const reports = createReportJobs();

/**
 * The menu whose Report flag a kind needs (and whose Financial puts
 * amounts in its files). Labour reports sit under Labour, the vendor
 * report under Vendor (`modules/08` decisions); the Reports page that
 * lists them is behind Reports (`reporting.project_reports`) Read. The Daily Progress Report sits under Progress
 * Report, which has no Report flag: it is requested, listed and deleted
 * from the Project's Progress Reports module (C / R / D, CM-606), never
 * from these routes.
 */
export const REPORT_MENU: Record<ReportKind, MenuKey> = {
  labour_attendance: "labour.labour",
  labour_payment: "labour.labour",
  labour_month: "labour.labour",
  muster_roll: "labour.labour",
  vendor_attendance: "labour.vendor",
  // Site work reports (CM-605, CM-608): Daily Work under Daily Worksheet,
  // usage under Equipment Usage (hire cost with its Financial), maintenance
  // and transfers under Equipments (maintenance cost with its Financial).
  daily_work: "site_work.daily_worksheet",
  owned_equipment_usage: "site_work.equipment_usage",
  rented_equipment_usage: "site_work.equipment_usage",
  equipment_maintenance: "masters.equipments",
  equipment_transfers: "masters.equipments",
  // CM-606: never through these routes (`hasOwnModule`).
  daily_progress_report: "site_work.progress_reports",
  // Finance reports (CM-709, ADR CM-0017 §14): the Ledger of a company
  // account under Company's Bank A/C (a petty-cash account's under Petty
  // Cash, `canReport`), party reports under Parties.
  account_ledger: "masters.bank_accounts",
  petty_cash: "finance.petty_cash",
  transactions: "finance.transactions",
  contractor_payments: "finance.parties",
  supplier_payments: "finance.parties",
  other_expenses: "finance.other_expenses",
  tds_194c: "finance.parties",
  due_payments: "finance.parties",
};

function scope(projectId: string | null) {
  return projectId == null ? {} : { projectId };
}

/**
 * The `report` flag on the kind's menu (and the Project). Never for a
 * kind with its own module: those routes check their own flags.
 */
export function canReport(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  if (hasOwnModule(kind)) return false;
  if (kind === "account_ledger")
    return (
      can(access, "masters.bank_accounts", "report") ||
      can(access, "finance.petty_cash", "report")
    );
  return can(access, REPORT_MENU[kind], "report", scope(projectId));
}

/** Financial on the kind's menu: amounts in the files. */
export function canSeeMoney(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  // Finance menus carry no Financial flag: Report is the right to see
  // their money (ADR CM-0017 §14).
  if (isFinanceReport(kind)) return canReport(access, kind, projectId);
  return can(access, REPORT_MENU[kind], "financial", scope(projectId));
}

/** The kinds this Team Member may report on for a Project (or centrally). */
export function reportableKinds(
  access: MemberAccess,
  projectId: string | null,
): ReportKind[] {
  return REPORT_KINDS.filter(
    (kind) =>
      (projectId != null || canBeCentral(kind)) &&
      canReport(access, kind, projectId),
  );
}

export function permissionDenied(
  message = "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
): Response {
  return jsonError(StatusCodes.FORBIDDEN, "PERMISSION_DENIED", message);
}

/** The Session and the Permission Matrix, checked per job by the caller. */
export async function requireReportSession(
  request: Request,
): Promise<AccessSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  return { ...session, access };
}

/**
 * A job this Team Member may open: `report` on its menu and Project. A
 * central report covers the requester's Projects, so only they and the
 * Owner may open it.
 */
export function mayOpen(session: AccessSession, job: ReportJob): boolean {
  if (!canReport(session.access, job.kind, job.projectId)) return false;
  if (job.projectId == null)
    return session.role === "owner" || job.requestedBy === session.userId;
  // A Petty Cash report may hold other holders' accounts (CM-0017 §9).
  if (job.kind === "petty_cash")
    return (
      job.requestedBy === session.userId ||
      can(session.access, "finance.petty_cash", "view_all")
    );
  return true;
}

/**
 * The petty-cash accounts the member may report on (CM-0017 §9): null
 * (every one) with View all or as the Owner, otherwise the account they
 * hold (none when they hold none).
 */
export async function pettyCashAccountScope(
  session: AccessSession,
): Promise<string[] | null> {
  if (can(session.access, "finance.petty_cash", "view_all")) return null;
  const member = await prisma.constructionOrganizationTeamMember.findFirst({
    where: {
      workspaceId: session.workspaceId,
      userId: session.userId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (member == null) return [];
  const accounts = await prisma.constructionFinanceAccount.findMany({
    where: {
      workspaceId: session.workspaceId,
      kind: "petty_cash",
      holderMemberId: member.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  return accounts.map((account) => account.id);
}

/**
 * Whether the member may run the Ledger of this account (CM-709): a
 * company account needs Company's Bank A/C Report; a petty-cash account
 * Petty Cash Report and either View all or holding it. A refusal is the
 * Response to send: 404 for an account that is not the Company's (or a
 * petty-cash account the member may not see), 403 without the flag.
 */
export async function ledgerRefusal(
  session: AccessSession,
  accountId: string,
): Promise<Response | null> {
  const account = await prisma.constructionFinanceAccount.findFirst({
    where: { workspaceId: session.workspaceId, id: accountId, deletedAt: null },
    select: { kind: true },
  });
  const notFound = jsonError(
    StatusCodes.NOT_FOUND,
    "ACCOUNT_NOT_FOUND",
    "There is no such account.",
  );
  if (account == null) return notFound;
  if (account.kind !== "petty_cash")
    return can(session.access, "masters.bank_accounts", "report")
      ? null
      : permissionDenied();
  if (!can(session.access, "finance.petty_cash", "report"))
    return permissionDenied();
  const scope = await pettyCashAccountScope(session);
  return scope == null || scope.includes(accountId) ? null : notFound;
}
