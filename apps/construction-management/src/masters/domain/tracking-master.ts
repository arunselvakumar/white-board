import {
  cleanMasterName,
  masterNotFound,
  type TrackingMasterKind,
} from "./master-kind";

/**
 * One row of a tracking master (CM-801, ADR CM-0019 §1): an Issue Category
 * or a Tag. Unlike the older name-only lists, a seed Issue Category may be
 * renamed and, when unused, deleted (§1: "renamed, disabled and deleted
 * when unused"). Tags are never disabled. Names are unique among the
 * Company's live rows, ignoring case (the store's partial index).
 */
export type TrackingMaster = {
  id: string;
  kind: TrackingMasterKind;
  workspaceId: string;
  name: string;
  /** One of the 14 Issue Categories every Company starts with; tags never. */
  isSeed: boolean;
  /** Issue Categories only: off the pickers, old issues keep it. */
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** What the audit log keeps of a row. */
export function trackingMasterSnapshot(row: TrackingMaster) {
  return {
    name: row.name,
    ...(row.kind === "issue_category"
      ? { isSeed: row.isSeed, disabled: row.disabledAt != null }
      : {}),
  };
}

/** A new row: the name cleaned (400 `<KIND>_NAME_REQUIRED` / `_TOO_LONG`). */
export function newTrackingMaster(input: {
  id: string;
  kind: TrackingMasterKind;
  workspaceId: string;
  name: string;
  by: string;
  now: Date;
}): TrackingMaster {
  return {
    id: input.id,
    kind: input.kind,
    workspaceId: input.workspaceId,
    name: cleanMasterName(input.kind, input.name),
    isSeed: false,
    disabledAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.by,
    updatedBy: input.by,
  };
}

/** Disable / enable applies to Issue Categories only; a Tag is 404 here. */
export function assertDisableable(row: TrackingMaster): void {
  if (row.kind !== "issue_category") throw masterNotFound(row.kind);
}
