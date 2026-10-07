import type { WorkspaceRole as Role } from "@repo/auth/roles";

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
  // Checked before the Staff routes so "sources" and "summary" never read as an Enquiry id.
  if (OWNER_ENQUIRY_PATH.test(pathname)) return isOwnerRole(role);
  if (STAFF_ENQUIRY_PATH.test(pathname))
    return isOwnerRole(role) || role === "teacher";
  return isOwnerRole(role);
}
