import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import type { CompanySession } from "@/app/api/_lib/require-session";
import type { ProcurementCommandActor } from "@/src/procurement/application/store-handlers";
import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";
import {
  encodeListCursor,
  type ListCursor,
} from "@/src/shared-kernel/list-cursor";
import { isWriteFlag } from "@/src/shared-kernel/plan";

export function actorOf(session: CompanySession): ProcurementCommandActor {
  return {
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: session.role,
  };
}

export function permissionDenied(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

/** 402 `PLAN_EXPIRED` for a write flag on an ended plan, else null. */
export async function planGate(
  session: CompanySession,
  flags: readonly Flag[],
): Promise<Response | null> {
  if (!flags.some(isWriteFlag)) return null;
  return requirePlanActive(session);
}

/** Whether the Team Member is on the Project (the Owner always is). */
export function onProject(access: MemberAccess, projectId: string): boolean {
  return access.role === "owner" || access.projectIds.has(projectId);
}

/**
 * `procurement.material_requests` is a Company-level menu, but a Material
 * Request belongs to a Project: the Project side (raise, edit, delete)
 * also needs the Team Member on the Project.
 */
export function canOnProject(
  access: MemberAccess,
  flag: Flag,
  projectId: string,
): boolean {
  return (
    can(access, "procurement.material_requests", flag) &&
    onProject(access, projectId)
  );
}

/**
 * Reading or closing a request: the flag on Material Requests, and either
 * the Project (its site) or Central Store read (the store side sees every
 * store's requests, ADR CM-0015 §11).
 */
export function canOnRequest(
  access: MemberAccess,
  flag: Flag,
  request: { projectId: string },
): boolean {
  return (
    can(access, "procurement.material_requests", flag) &&
    (onProject(access, request.projectId) ||
      can(access, "procurement.central_store", "read"))
  );
}

/** Next / previous cursors of a newest-first page (root ADR-0020). */
export function pageCursors(
  page: { items: readonly ListCursor[]; hasMore: boolean },
  model: { after?: string; before?: string },
): { nextCursor: string | null; prevCursor: string | null } {
  const first = page.items[0];
  const last = page.items.at(-1);
  const backwards = model.before != null;
  const moreAfter = backwards || page.hasMore;
  const moreBefore = backwards ? page.hasMore : model.after != null;
  return {
    nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
    prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
  };
}
