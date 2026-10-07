import { mapError } from "@/app/api/_lib/map-error";
import {
  requireWorkspaceSession,
  verifiedEmailsOf,
} from "@/app/api/_lib/require-workspace-session";
import {
  relevantClassChanges,
  type CalendarRole,
} from "@/src/training-institute/application/calendar-schedule";
import { createCalendarScheduleReader } from "@/src/training-institute/infrastructure/create-calendar-schedule-reader";
import { createClassExceptionsReader } from "@/src/training-institute/infrastructure/create-class-change-handlers";

export const dynamic = "force-dynamic";

const query = createCalendarScheduleReader();
const exceptions = createClassExceptionsReader();
const roles = [
  "owner",
  "teacher",
  "student",
  "parent",
] as const satisfies readonly CalendarRole[];

export async function GET(): Promise<Response> {
  try {
    const session = await requireWorkspaceSession(
      roles,
      "Calendar access is not available for this role.",
    );
    if (session instanceof Response) return session;
    const { userId, workspaceId, role } = session;

    const items = await query.execute({
      workspaceId,
      userId,
      role,
      verifiedEmails:
        role === "student" || role === "parent"
          ? verifiedEmailsOf(session.user)
          : undefined,
    });
    const { changes, holidays } = await exceptions.forBatches(
      workspaceId,
      items.map((item) => item.batchId),
    );
    return Response.json({
      items,
      classChanges: relevantClassChanges(items, changes),
      holidays,
      permissions: {
        changeClasses: role === "owner" || role === "teacher",
        manageHolidays: role === "owner",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
