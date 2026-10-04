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
  return isOwnerRole(role);
}
