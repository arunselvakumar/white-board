import type { AccessSession } from "@/app/api/_lib/require-access";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireTrackingRecordAccess } from "@/app/api/construction/tracking/tracking-access";
import { createTaskHandlers } from "@/src/composition/tracking-tasks";
import type { Flag } from "@/src/shared-kernel/access";
import { TASK_MENU } from "@/src/tracking/application/task-handlers";
import type { TaskRow } from "@/src/tracking/application/task-store";

export { TASK_MENU };

/** One set of task handlers for every route (CM-802). */
export const taskHandlers = createTaskHandlers();

type Flags = Flag | readonly [Flag, ...Flag[]];

/**
 * The Session plus the Permission Matrix check for a route about one task:
 * it is loaded first (404 for another Company's or a deleted one), then
 * `flags` are checked on its Project. View-all scoping is the handlers'.
 */
export function requireTaskAccess(
  request: Request,
  id: string,
  flags: Flags,
): Promise<(AccessSession & { target: TaskRow }) | Response> {
  return requireTrackingRecordAccess(request, TASK_MENU, flags, (workspaceId) =>
    taskHandlers.find(workspaceId, id),
  );
}

/**
 * The Session for editing or deleting one progress update: the update and
 * its task are loaded first (404 for another Company's or a deleted one),
 * then Task read on the task's Project and an active plan. Whether the
 * caller is its author or holds Task update is the handlers' check.
 */
export async function requireProgressAccess(
  request: Request,
  progressId: string,
): Promise<(AccessSession & { target: TaskRow }) | Response> {
  const session = await requireTrackingRecordAccess(
    request,
    TASK_MENU,
    "read",
    (workspaceId) => taskHandlers.progressTask(workspaceId, progressId),
  );
  if (isResponse(session)) return session;
  const ended = await requirePlanActive(session);
  return ended ?? session;
}
