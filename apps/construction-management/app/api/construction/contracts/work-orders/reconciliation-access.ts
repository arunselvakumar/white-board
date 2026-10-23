import { can, type MemberAccess } from "@/src/shared-kernel/access";

/**
 * Who may assign an unattributed issue to a Work Order (CM-1110):
 * procurement owns the command (Material Requests update, with the Team
 * Member on the Project).
 */
export function canAssignIssues(
  access: MemberAccess,
  projectId: string,
): boolean {
  return (
    can(access, "procurement.material_requests", "update") &&
    (access.role === "owner" || access.projectIds.has(projectId))
  );
}
