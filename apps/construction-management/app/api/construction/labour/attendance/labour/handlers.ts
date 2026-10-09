import { can, type MemberAccess } from "@/src/shared-kernel/access";
import { createLabourAttendanceHandlers } from "@/src/labour/infrastructure/labour-attendance-factory";

/** One set of labour attendance handlers for every route (CM-210, CM-211). */
export const labourAttendanceHandlers = createLabourAttendanceHandlers();

/** Wages and earned amounts need Labour (`labour.labour`) Financial on the Project. */
export function labourFinancial(
  access: MemberAccess,
  projectId: string,
): boolean {
  return can(access, "labour.labour", "financial", { projectId });
}

export function actorOf(session: {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
}) {
  return {
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: session.role,
  };
}
