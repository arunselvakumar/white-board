import { type AppHref, pageHref } from "@/lib/page-href";

/**
 * Screen paths of the tracking records (M8, ADR CM-0019) under a Project:
 * `/app/projects/<id>/tasks/<taskId>`, `…/issues/<issueId>`,
 * `…/inspections/<inspectionId>`. The Gallery links a file back to its
 * record with them; the detail pages live at these segments.
 */
const SEGMENTS = {
  task: "tasks",
  issue: "issues",
  inspection: "inspections",
} as const;

export type TrackingRecordType = keyof typeof SEGMENTS;

export function isTrackingRecordType(
  value: string,
): value is TrackingRecordType {
  return value in SEGMENTS;
}

export function trackingRecordPath(
  projectId: string,
  type: TrackingRecordType,
  id: string,
): AppHref {
  if (type === "task")
    return pageHref("/app/projects/[id]/tasks/[taskId]", {
      id: projectId,
      taskId: id,
    });
  if (type === "issue")
    return pageHref("/app/projects/[id]/issues/[issueId]", {
      id: projectId,
      issueId: id,
    });
  return pageHref("/app/projects/[id]/inspections/[inspectionId]", {
    id: projectId,
    inspectionId: id,
  });
}

/** "Open Task" / "Open Issue" / "Open Inspection Request". */
export function trackingRecordLinkLabel(type: TrackingRecordType): string {
  if (type === "task") return "Open Task";
  if (type === "issue") return "Open Issue";
  return "Open Inspection Request";
}
