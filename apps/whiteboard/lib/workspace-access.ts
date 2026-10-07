export type WorkspaceRole = string | null | undefined;

export function isOwnerRole(role: WorkspaceRole): boolean {
  return role === "org:admin";
}

export function destinationForRole(role: WorkspaceRole): string {
  if (role === "org:student") return "/student";
  if (role === "org:parent") return "/parent";
  if (role === "org:teacher") return "/teacher";
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
      role === "org:admin" ||
      role === "org:teacher" ||
      role === "org:student" ||
      role === "org:parent"
    );
  if (pathname === "/online-classes")
    return (
      role === "org:admin" ||
      role === "org:teacher" ||
      role === "org:student" ||
      role === "org:parent"
    );
  if (/^\/classes\/[^/]+\/[^/]+\/[^/]+$/.test(pathname))
    return (
      role === "org:admin" ||
      role === "org:teacher" ||
      role === "org:student" ||
      role === "org:parent"
    );
  if (pathname === "/student") return role === "org:student";
  if (pathname === "/parent") return role === "org:parent";
  if (pathname === "/teacher") return role === "org:teacher";
  if (/^\/teacher\/batches\/[^/]+\/attendance$/.test(pathname))
    return role === "org:teacher";
  // Checked before the Staff routes so "sources" and "summary" never read as an Enquiry id.
  if (OWNER_ENQUIRY_PATH.test(pathname)) return isOwnerRole(role);
  if (STAFF_ENQUIRY_PATH.test(pathname))
    return isOwnerRole(role) || role === "org:teacher";
  return isOwnerRole(role);
}
