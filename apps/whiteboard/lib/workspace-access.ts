export type WorkspaceRole = string | null | undefined;

export function isOwnerRole(role: WorkspaceRole): boolean {
  return role === "org:admin";
}

export function destinationForRole(role: WorkspaceRole): string {
  if (role === "org:student") return "/student";
  if (role === "org:parent") return "/parent";
  return "/";
}

export function isAllowedAppPath(pathname: string, role: WorkspaceRole): boolean {
  if (pathname === "/") return true;
  if (pathname === "/student") return role === "org:student";
  if (pathname === "/parent") return role === "org:parent";
  return isOwnerRole(role);
}
