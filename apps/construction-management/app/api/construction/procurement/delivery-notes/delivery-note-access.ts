import { prisma } from "@repo/construction-db";

import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "@/app/api/_lib/require-session";
import type { DeliveryNoteReadModel } from "@/src/procurement/application/delivery-note-handlers";
import { deliveryNoteNotFound } from "@/src/procurement/infrastructure/delivery-note-repository";
import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  canOnProject,
  permissionDenied,
  planGate,
} from "../stores/central-store-access";
import { centralStore } from "../stores/central-store-wiring";

export type NoteSession = CompanySession & {
  access: MemberAccess;
  note: DeliveryNoteReadModel;
};

/**
 * The Session plus a check on one live Delivery Note (404 for another
 * Company's or a deleted one): the Delivery Note flag (the store side),
 * or, when `projectFlag` is given, that flag on Material Requests with the
 * member on the note's Project (the site side: read, Mark as Delivered).
 */
export async function requireNoteAccess(
  request: Request,
  id: string,
  flag: Flag,
  projectFlag?: Flag,
): Promise<NoteSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  const note = await centralStore.deliveryNotes.get(session.workspaceId, id);
  if (note == null) throw deliveryNoteNotFound();
  const allowed =
    can(access, "procurement.delivery_notes", flag) ||
    (projectFlag != null && canOnProject(access, projectFlag, note.projectId));
  if (!allowed) return permissionDenied();
  const ended = await planGate(session, [flag]);
  if (ended != null) return ended;
  return { ...session, access, note };
}
