import { can, type MemberAccess } from "@/src/shared-kernel/access";

import {
  catalogueEntry,
  entriesIn,
  type ReportCatalogueEntry,
  type ReportScope,
} from "../domain/report-catalogue";
import type { ReportKind } from "../domain/report-job";

/**
 * Who may request, open and see the money of each kind of report, read
 * from the catalogue's menu and flags (ADR CM-0021 §2). The routes and
 * the catalogue route share these, so a card is offered exactly when its
 * request would be accepted.
 */

function onProject(projectId: string | null) {
  return projectId == null ? {} : { projectId };
}

function menusOf(entry: ReportCatalogueEntry) {
  return [entry.menu, ...(entry.orMenus ?? [])];
}

/** The Central Reports menu (ADR CM-0021 §5, CM-903). */
export const CENTRAL_REPORTS_MENU = "reporting.central_reports" as const;

/**
 * Central Reports Read, which a central report needs besides its own
 * flag, unless it is one a module hosts (`centralHost`: Central Payment,
 * Masters → Equipments), whose gate stays that module's (CM-903).
 */
function passesCentralGate(
  access: MemberAccess,
  entry: ReportCatalogueEntry,
  projectId: string | null,
): boolean {
  if (projectId != null || entry.centralHost != null) return true;
  return can(access, CENTRAL_REPORTS_MENU, "read");
}

/**
 * The catalogue's `request` flag on the kind's menu (or one of its
 * others) and Project; centrally also Central Reports Read unless a
 * module hosts the report.
 */
export function canRequestReport(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  const entry = catalogueEntry(kind);
  if (!passesCentralGate(access, entry, projectId)) return false;
  return menusOf(entry).some((menu) =>
    can(access, menu, entry.request, onProject(projectId)),
  );
}

/** The catalogue's `download` flag on the kind's menu (or one of its others) and Project, behind the same central gate. */
export function canDownloadReport(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  const entry = catalogueEntry(kind);
  if (!passesCentralGate(access, entry, projectId)) return false;
  return menusOf(entry).some((menu) =>
    can(access, menu, entry.download, onProject(projectId)),
  );
}

/**
 * The money right for the kind: Financial (or the kind's `moneyFlag`) on
 * its money menu; for a finance report, Report on its menu (finance
 * menus have no Financial, CM-0017 §14).
 */
export function canSeeReportMoney(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  const entry = catalogueEntry(kind);
  if (entry.group === "finance")
    return canRequestReport(access, kind, projectId);
  return can(
    access,
    entry.moneyMenu ?? entry.menu,
    entry.moneyFlag ?? "financial",
    onProject(projectId),
  );
}

/** A catalogue entry as one viewer sees it. */
export type ViewerCatalogueEntry = ReportCatalogueEntry & {
  /** Their files of it would carry amounts. */
  includesMoney: boolean;
};

/**
 * The reports this viewer may request in `scope` (on `projectId` for a
 * Project): built ones only, with the request flag, and, for a report
 * about money, the money right. In the catalogue's order.
 */
export function viewerCatalogue(
  access: MemberAccess,
  scope: ReportScope,
  projectId: string | null,
): ViewerCatalogueEntry[] {
  const on = scope === "project" ? projectId : null;
  return entriesIn(scope).flatMap((entry) => {
    if (!entry.available || !canRequestReport(access, entry.kind, on))
      return [];
    const money = canSeeReportMoney(access, entry.kind, on);
    if (entry.money === "always" && !money) return [];
    return [{ ...entry, includesMoney: money && entry.money !== "never" }];
  });
}
