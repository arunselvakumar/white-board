import type { WorkspaceRole as Role } from "@repo/auth/roles";

import type { PreschoolRole } from "@/src/queries/preschool/me";
import {
  isReportKey,
  reportDefinition,
} from "@/src/training-institute/domain/report-catalogue";

export type WorkspaceRole = Role | null | undefined;

export function isOwnerRole(role: WorkspaceRole): boolean {
  return role === "owner";
}

export function destinationForRole(role: WorkspaceRole): string {
  if (role === "student") return "/student";
  if (role === "parent") return "/parent";
  if (role === "teacher") return "/teacher";
  return "/";
}

/** Enquiry Sources, the Enquiry summary, and Convert to Student: Owner only (ADR-0032). */
const OWNER_ENQUIRY_PATH = /^\/enquiries\/(?:sources|summary|[^/]+\/convert)$/;

/** The Enquiries list, Add enquiry, an Enquiry, and Edit enquiry: Owner and Teachers. */
const STAFF_ENQUIRY_PATH =
  /^\/enquiries(?:\/new|\/(?!(?:new|sources|summary)(?:\/|$))[^/]+(?:\/edit)?)?$/;

const REPORT_PATH = /^\/reports\/([^/]+)$/;

function canOpenReport(report: string, role: WorkspaceRole): boolean {
  return (
    role != null &&
    isReportKey(report) &&
    reportDefinition(report).roles.includes(role)
  );
}

export function isAllowedAppPath(
  pathname: string,
  role: WorkspaceRole,
): boolean {
  if (pathname === "/") return true;
  if (pathname === "/calendar")
    return (
      role === "owner" ||
      role === "teacher" ||
      role === "student" ||
      role === "parent"
    );
  if (pathname === "/online-classes")
    return (
      role === "owner" ||
      role === "teacher" ||
      role === "student" ||
      role === "parent"
    );
  if (/^\/classes\/[^/]+\/[^/]+\/[^/]+$/.test(pathname))
    return (
      role === "owner" ||
      role === "teacher" ||
      role === "student" ||
      role === "parent"
    );
  if (pathname === "/student") return role === "student";
  if (pathname === "/parent") return role === "parent";
  if (pathname === "/teacher") return role === "teacher";
  // Homework and Study Material (ADR-0033): the family page and a Homework.
  if (/^\/student\/homework(?:\/[^/]+)?$/.test(pathname))
    return role === "student";
  if (/^\/parent\/homework(?:\/[^/]+)?$/.test(pathname))
    return role === "parent";
  if (/^\/teacher\/batches\/[^/]+\/attendance$/.test(pathname))
    return role === "teacher";
  // A Batch's Homework and Study Material, and one Homework's Submissions.
  if (/^\/teacher\/batches\/[^/]+\/homework(?:\/[^/]+)?$/.test(pathname))
    return role === "teacher";
  // Tests (ADR-0038): the family Results page, a Batch's Tests, one Test,
  // and a Student's Test history from the Teacher's Batch.
  if (pathname === "/student/results") return role === "student";
  if (pathname === "/parent/results") return role === "parent";
  if (
    /^\/teacher\/batches\/[^/]+\/(?:tests(?:\/[^/]+)?|students\/[^/]+)$/.test(
      pathname,
    )
  )
    return role === "teacher";
  // Absence Notices (ADR-0041): a Teacher's expected absentees and the
  // Notifications under the bell. The Owner's list is /absence-notices.
  if (pathname === "/teacher/absence-notices") return role === "teacher";
  if (pathname === "/notifications") return role === "teacher";
  // Reports: the catalogue for every role, Report settings for the Owner,
  // and each report for the roles the Reports catalogue lists.
  if (pathname === "/reports")
    return (
      role === "owner" ||
      role === "teacher" ||
      role === "student" ||
      role === "parent"
    );
  if (pathname === "/reports/settings") return isOwnerRole(role);
  const report = REPORT_PATH.exec(pathname)?.[1];
  if (report != null) return canOpenReport(report, role);
  // Checked before the Staff routes so "sources" and "summary" never read as an Enquiry id.
  if (OWNER_ENQUIRY_PATH.test(pathname)) return isOwnerRole(role);
  if (STAFF_ENQUIRY_PATH.test(pathname))
    return isOwnerRole(role) || role === "teacher";
  return isOwnerRole(role);
}

/** In-app areas whose screens depend on the role. */
const ROLE_GATED_AREAS = new Set([
  "students",
  "courses",
  "batches",
  "fees",
  "enrollments",
  "payments",
  "student",
  "parent",
  "teacher",
  "teachers",
  "attendance",
  "calendar",
  "classes",
  "enquiries",
  "absence-notices",
  "notifications",
  "reports",
]);

/** `/preschool` and everything under it: the Preschool screens (ADR-0055). */
export function isPreschoolPath(pathname: string): boolean {
  return pathname === "/preschool" || pathname.startsWith("/preschool/");
}

/**
 * True when a User with `role` must be sent from this in-app path to the
 * In-app Home. The Workspace Gate checks it on every navigation; the APIs
 * behind each screen enforce the same roles with 403 (ADR-0013).
 *
 * Screens follow the Institution Type first (ADR-0055): a Preschool
 * Workspace opens only the In-app Home and `/preschool/**`, and no other
 * Workspace opens `/preschool/**`. Without a type, a Training Institute.
 */
export function mustLeaveAppPath(
  pathname: string,
  role: WorkspaceRole,
  institutionType?: string | null,
): boolean {
  if (institutionType === "preschool")
    return pathname !== "/" && !isPreschoolPath(pathname);
  if (isPreschoolPath(pathname)) return true;
  const area = pathname.split("/")[1];
  return (
    area != null &&
    ROLE_GATED_AREAS.has(area) &&
    !isAllowedAppPath(pathname, role)
  );
}

/** Where each Preschool role lands: the In-app Home sends them here. */
export function preschoolHomeFor(role: PreschoolRole): string {
  if (role === "teacher") return "/preschool/teacher";
  if (role === "parent") return "/preschool/family";
  return "/preschool";
}

/** Areas under `/preschool` a Teacher may not open: fee amounts and masters. */
const TEACHER_CLOSED_AREAS = new Set([
  "",
  "fees",
  "centres",
  "staff",
  "head-office",
  "programmes",
  "stock",
  "enquiries",
]);

/**
 * Head Office screens and Workspace-wide masters: the Owner only. Fee
 * Structures stay open to a Centre Head, who sees their Centre's amounts,
 * and so does one Stock Item's ledger (`/preschool/stock/items/<id>`); the
 * Stock Items list itself is the Owner's.
 */
const OWNER_ONLY_PATH =
  /^\/preschool\/(?:(?:head-office|centres|programmes)(?:\/|$)|stock\/items\/?$)/;

/**
 * Whether a Preschool role may open a path under `/preschool` (ADR-0055).
 * Parents open only the family area; Teachers their Home and the Classroom
 * screens, never fees or masters; Centre Heads everything inside a Centre;
 * the Owner everything but the Teacher and family Homes. The APIs enforce
 * the same with 403.
 */
export function isAllowedPreschoolPath(
  pathname: string,
  role: PreschoolRole,
): boolean {
  if (!isPreschoolPath(pathname)) return false;
  const area = pathname.split("/")[2] ?? "";
  if (role === "parent") return area === "family";
  if (area === "family") return false;
  if (role === "teacher") return !TEACHER_CLOSED_AREAS.has(area);
  if (area === "teacher") return false;
  if (role === "centre_head") return !OWNER_ONLY_PATH.test(pathname);
  return true;
}
