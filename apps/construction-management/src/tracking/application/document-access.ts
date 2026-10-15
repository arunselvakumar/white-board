import { can, type MemberAccess } from "@/src/shared-kernel/access";

import type { LocatedTrackingDocument } from "../domain/document-files";
import { TRACKING_DOCUMENTS } from "../domain/tracking-documents";

/**
 * What a member may do with a tracking document's files (ADR CM-0019 §11):
 * - **read** (see and open the files): Read on the document's menu on its
 *   Project, and — for tasks and issues without View all — the document is
 *   one they created or are assigned to (§5, §8);
 * - **upload**: Update for task photos (they come with progress); Create or
 *   Update for issue images and attachments and inspection files;
 * - **remove any file**: Update; with upload rights only, their own uploads.
 *
 * Inspections (CM-804): the request's **inspector** may upload (for their
 * observations) while it is pending, even with Read only; once it is
 * approved or rejected nobody uploads or removes its files (the service
 * answers 409 `INSPECTION_DECIDED`).
 */
export type TrackingDocumentRights = {
  read: boolean;
  upload: boolean;
  removeAny: boolean;
  removeOwn: boolean;
};

/** Whether the member sees the document at all (Read, then View all scoping). */
export function canReadTrackingDocument(
  access: MemberAccess,
  document: Pick<
    LocatedTrackingDocument,
    "type" | "projectId" | "createdBy" | "assigneeMemberIds"
  >,
  /** The viewer's own Team Member id; null for a User without one. */
  viewerMemberId: string | null,
): boolean {
  const { menu } = TRACKING_DOCUMENTS[document.type];
  const scope = { projectId: document.projectId };
  if (!can(access, menu, "read", scope)) return false;
  if (document.assigneeMemberIds == null) return true;
  if (can(access, menu, "view_all", scope)) return true;
  if (document.createdBy === access.userId) return true;
  return (
    viewerMemberId != null &&
    document.assigneeMemberIds.includes(viewerMemberId)
  );
}

export function trackingDocumentRights(
  access: MemberAccess,
  document: Pick<
    LocatedTrackingDocument,
    "type" | "projectId" | "createdBy" | "assigneeMemberIds"
  > & { inspection?: LocatedTrackingDocument["inspection"] },
  viewerMemberId: string | null,
): TrackingDocumentRights {
  const read = canReadTrackingDocument(access, document, viewerMemberId);
  const { menu } = TRACKING_DOCUMENTS[document.type];
  const scope = { projectId: document.projectId };
  const update = can(access, menu, "update", scope);
  const create = can(access, menu, "create", scope);
  const inspection = document.inspection ?? null;
  if (inspection != null && inspection.status !== "pending")
    return { read, upload: false, removeAny: false, removeOwn: false };
  const inspector =
    inspection?.inspectorMemberId != null &&
    viewerMemberId === inspection.inspectorMemberId;
  const upload =
    read && (document.type === "task" ? update : create || update || inspector);
  return {
    read,
    upload,
    removeAny: read && update,
    removeOwn: upload,
  };
}

/** Whether the document's files are final: a decided inspection (CM-804). */
export function trackingFilesFinal(
  document: Pick<LocatedTrackingDocument, "inspection">,
): "approved" | "rejected" | null {
  const status = document.inspection?.status;
  return status === "approved" || status === "rejected" ? status : null;
}

/** Whether these rights remove this file. */
export function mayRemoveTrackingFile(
  rights: TrackingDocumentRights,
  file: { createdBy: string },
  userId: string,
): boolean {
  return rights.removeAny || (rights.removeOwn && file.createdBy === userId);
}
