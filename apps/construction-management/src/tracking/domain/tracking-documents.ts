import type { DocumentNaming } from "@/src/shared-kernel/approval";
import type { BackdatedModuleKey } from "@/src/shared-kernel/backdated-policy";
import type { MenuKey } from "@/src/shared-kernel/access/menus";
import type { SequenceModuleKey } from "@/src/shared-kernel/sequence";

/**
 * The three tracking documents (ADR CM-0019) and what each one is wired
 * to: its Permission Matrix menu, numbering module, back-dated module, the
 * naming its errors use, and the Gallery source of its files (§11). Every
 * tracking menu is Project-scoped.
 */
export const TRACKING_DOCUMENT_TYPES = ["task", "issue", "inspection"] as const;
export type TrackingDocumentType = (typeof TRACKING_DOCUMENT_TYPES)[number];

export type TrackingDocument = {
  type: TrackingDocumentType;
  naming: DocumentNaming;
  menu: MenuKey;
  /** Null for tasks: Task No. is a per-Project counter (CM-0019 §2). */
  sequence: SequenceModuleKey | null;
  /** Null for tasks: not in back-dated entry control (CM-0019 §3). */
  backdated: BackdatedModuleKey | null;
  /** `ProjectMediaAttached.source`; the Gallery links back by it. */
  gallerySource: string;
};

export const TRACKING_DOCUMENTS: Record<
  TrackingDocumentType,
  TrackingDocument
> = {
  task: {
    type: "task",
    naming: { code: "TASK", label: "Task" },
    menu: "tracking.tasks",
    sequence: null,
    backdated: null,
    gallerySource: "task",
  },
  issue: {
    type: "issue",
    naming: { code: "ISSUE", label: "Issue" },
    menu: "tracking.issues",
    sequence: "issue",
    backdated: "issue",
    gallerySource: "issue",
  },
  inspection: {
    type: "inspection",
    naming: { code: "INSPECTION", label: "Inspection Request" },
    menu: "tracking.inspection_requests",
    sequence: "inspection_request",
    backdated: "inspection_request",
    gallerySource: "inspection",
  },
};

/** The tracking menus, for access checks and the access route. */
export const TRACKING_MENUS = {
  task: TRACKING_DOCUMENTS.task.menu,
  issue: TRACKING_DOCUMENTS.issue.menu,
  inspection: TRACKING_DOCUMENTS.inspection.menu,
} as const;

export function isTrackingDocumentType(
  value: string,
): value is TrackingDocumentType {
  return (TRACKING_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Priority of a task or issue (CM-0019 §5, §7); colour and label on screen. */
export const TRACKING_PRIORITIES = [
  { key: "high", label: "High", color: "#F90B0B" },
  { key: "medium", label: "Medium", color: "#FF9900" },
  { key: "low", label: "Low", color: "#FCF200" },
] as const;
export type TrackingPriority = (typeof TRACKING_PRIORITIES)[number]["key"];

export function isTrackingPriority(value: string): value is TrackingPriority {
  return TRACKING_PRIORITIES.some((item) => item.key === value);
}
