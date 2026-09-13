import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createDashboardHandlers } from "@/src/training/infrastructure/create-dashboard-handlers";

export const dynamic = "force-dynamic";

const handlers = createDashboardHandlers();

export async function GET(): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const dashboard = await handlers.get.execute({
      workspaceId: session.orgId,
    });
    return Response.json({
      activeStudentCount: dashboard.activeStudentCount,
      outstandingDuesPaise: dashboard.outstandingDuesPaise,
      todayBatches: dashboard.todayBatches,
      recentStudents: dashboard.recentStudents.map((student) => ({
        ...student,
        createdAt: student.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return mapError(error);
  }
}
