import type { Prisma } from "@repo/construction-db";

/**
 * Ports of the tracking context (ADR CM-0019): what Tasks, Issues & Snags
 * and Inspection Requests read from other contexts. Adapters live in
 * `src/composition`; tracking never imports another context's folder.
 *
 * Append-only: each M8 ticket adds its ports below its own heading.
 */

/** A transaction on the Construction client; ports run inside the caller's. */
export type TrackingTx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// TrackingDirectory (CM-801): projects, organization and masters facts.
// `src/composition/tracking-directory.ts` implements it by table.
// ---------------------------------------------------------------------------

/** A live Project of the Company. */
export type TrackingProjectFacts = {
  id: string;
  name: string;
  /** Wings (a building) or Locations (ADR CM-0013 §1). */
  structure: "wings" | "locations";
};

/**
 * A Team Member (`*_member_id` columns hold these ids, not User ids). The
 * Owner is on every Project.
 */
export type TrackingMemberFacts = {
  id: string;
  /** Null until the member joins. */
  userId: string | null;
  name: string;
  isOwner: boolean;
  /** Joined, active and not removed. */
  active: boolean;
  /** Assigned to the Project asked about, or the Owner. */
  onProject: boolean;
};

/** A name-only master row: Departments, Measurement Units, Issue Categories, Tags. */
export type TrackingNamedFacts = {
  id: string;
  name: string;
  /** Disabled in Masters: kept on old rows, not offered by pickers. Tags never are. */
  disabled: boolean;
};

/** A Contractor and whether it is assigned to the Project (Resources, CM-406). */
export type TrackingContractorFacts = {
  id: string;
  name: string;
  isActive: boolean;
  onProject: boolean;
  departmentIds: readonly string[];
};

/** A Project Drawing (ADR CM-0013 §8) an inspection can link. */
export type TrackingDrawingFacts = {
  id: string;
  name: string;
  albumName: string;
  /** Latest revision number (R1, R2 …); null when it has no file yet. */
  revision: number | null;
  /** The drawing is on the Project asked about. */
  onProject: boolean;
};

/** Ids a request names; omit what it does not use. */
export type TrackingReferenceIds = {
  memberIds?: readonly string[];
  departmentIds?: readonly string[];
  contractorIds?: readonly string[];
  unitIds?: readonly string[];
  issueCategoryIds?: readonly string[];
  tagIds?: readonly string[];
  drawingIds?: readonly string[];
};

/**
 * What `references` found, keyed by id. Only the Company's **live** rows
 * are present: an id that is missing is another Company's, deleted, or
 * made up, and the caller refuses it (`*_NOT_FOUND` with the id in
 * `details`). Disabled / inactive / off-Project rows are present and
 * marked, so the caller decides (a new pick must be enabled and on the
 * Project; an unchanged old one may stay).
 */
export type TrackingReferences = {
  /** Null when the Project is not a live Project of the Company. */
  project: TrackingProjectFacts | null;
  members: ReadonlyMap<string, TrackingMemberFacts>;
  departments: ReadonlyMap<string, TrackingNamedFacts>;
  contractors: ReadonlyMap<string, TrackingContractorFacts>;
  units: ReadonlyMap<string, TrackingNamedFacts>;
  issueCategories: ReadonlyMap<string, TrackingNamedFacts>;
  tags: ReadonlyMap<string, TrackingNamedFacts>;
  drawings: ReadonlyMap<string, TrackingDrawingFacts>;
};

/** Ids to name on lists and detail pages, removed rows included. */
export type TrackingNameIds = TrackingReferenceIds & {
  /** `created_by` / `updated_by` / `solved_by` … are User ids. */
  userIds?: readonly string[];
};

/** Names by id for display; removed rows keep their name. */
export type TrackingNames = {
  members: ReadonlyMap<string, string>;
  users: ReadonlyMap<string, string>;
  departments: ReadonlyMap<string, string>;
  contractors: ReadonlyMap<string, string>;
  units: ReadonlyMap<string, string>;
  issueCategories: ReadonlyMap<string, string>;
  tags: ReadonlyMap<string, string>;
  drawings: ReadonlyMap<string, string>;
};

/** The pickers a tracking form can ask for. */
export const TRACKING_OPTION_KINDS = [
  "members",
  "departments",
  "contractors",
  "units",
  "issueCategories",
  "tags",
  "drawings",
] as const;
export type TrackingOptionKind = (typeof TRACKING_OPTION_KINDS)[number];

/**
 * Picker options on a Project, by name: active Team Members on the Project
 * (the Owner included), enabled Departments, Units and Issue Categories,
 * active Contractors assigned to the Project, every Tag, the Project's live
 * Drawings (album, then name). Kinds not asked for are empty.
 */
export type TrackingOptions = {
  members: TrackingMemberFacts[];
  departments: TrackingNamedFacts[];
  contractors: TrackingContractorFacts[];
  units: TrackingNamedFacts[];
  issueCategories: TrackingNamedFacts[];
  tags: TrackingNamedFacts[];
  drawings: TrackingDrawingFacts[];
};

/**
 * What tracking reads from projects, organization and masters, by
 * Company and id. Pass the transaction you are in (or the client) as `db`.
 */
export type TrackingDirectory = {
  /** A live Project of the Company, or null (404 `PROJECT_NOT_FOUND`). */
  project(
    db: TrackingTx,
    workspaceId: string,
    projectId: string,
  ): Promise<TrackingProjectFacts | null>;
  /**
   * Validates a request's references in one call: the Project and every
   * id named, with `onProject` answered for `projectId`.
   */
  references(
    db: TrackingTx,
    workspaceId: string,
    projectId: string,
    ids: TrackingReferenceIds,
  ): Promise<TrackingReferences>;
  /** Names for lists and detail pages, removed rows included. */
  names(
    db: TrackingTx,
    workspaceId: string,
    ids: TrackingNameIds,
  ): Promise<TrackingNames>;
  /** Picker options on a Project (form-options routes). */
  options(
    db: TrackingTx,
    workspaceId: string,
    projectId: string,
    kinds: readonly TrackingOptionKind[],
  ): Promise<TrackingOptions>;
  /**
   * The caller's own Team Member (View-all scoping: "assigned to me"
   * compares Team Member ids), or null for a User with none. Not asked
   * about a Project: `onProject` is true only for the Owner.
   */
  memberOfUser(
    db: TrackingTx,
    workspaceId: string,
    userId: string,
  ): Promise<TrackingMemberFacts | null>;
};

// ---------------------------------------------------------------------------
// TaskUsage (CM-802): what names a task outside tracking.
// `src/composition/task-usage.ts` implements it on the site-work tables.
// ---------------------------------------------------------------------------

/**
 * A task named by a live Daily Worksheet (`construction_site_work.
 * worksheets.task_id`) cannot be deleted (CM-0019 §2): 409 `TASK_IN_USE`.
 */
export type TaskUsage = {
  /** Live Daily Worksheets naming each task, by task id; absent means none. */
  worksheetCounts(
    db: TrackingTx,
    workspaceId: string,
    taskIds: readonly string[],
  ): Promise<Map<string, number>>;
};

// ---------------------------------------------------------------------------
// TaskTags (CM-802): the import creates unknown tags through the masters'
// inline-create path (`ensure`, ADR CM-0019 §1, §13).
// `src/composition/task-tags.ts` implements it.
// ---------------------------------------------------------------------------

export type TaskTags = {
  /**
   * The live Tag of each name (any case), created when missing, by the
   * lower-cased name. The caller checks Tags Create first.
   */
  ensure(
    workspaceId: string,
    by: string,
    names: readonly string[],
  ): Promise<Map<string, string>>;
};

// ---------------------------------------------------------------------------
// CM-804 Inspection Requests: where a linked drawing opens.
// `src/composition/tracking-drawing-links.ts` implements it.
// ---------------------------------------------------------------------------

/** A live Project Drawing with the album its page lives in (ADR CM-0013 §8). */
export type TrackingDrawingLink = {
  id: string;
  name: string;
  albumId: string;
  albumName: string;
  /** Latest revision number (R1, R2 …); null when it has no file yet. */
  revision: number | null;
};

/**
 * Live drawings of the Company by id, for the links on an Inspection
 * Request (`TrackingDrawingFacts` has no album id). Missing ids are
 * deleted or another Company's.
 */
export type TrackingDrawingLinks = (
  db: TrackingTx,
  workspaceId: string,
  drawingIds: readonly string[],
) => Promise<ReadonlyMap<string, TrackingDrawingLink>>;
