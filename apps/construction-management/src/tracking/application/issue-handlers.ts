import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
  type LocationType,
} from "@/src/shared-kernel/location-ref";

import {
  trackingDocumentMediaRemoved,
  trackingFilesMediaRemoved,
  type TrackingDocumentFile,
} from "../domain/document-files";
import type { IssueEvent } from "../domain/events";
import {
  assertCanDeleteUpdate,
  assertEditable,
  assertTransition,
  canDeleteUpdate,
  canTransition,
  issueFields,
  issueStatus,
  reopenReason,
  updateBody,
  type IssueEventKind,
  type IssueFields,
  type IssueInput,
  type IssueStatus,
  type IssueStoredStatus,
  type IssueTransition,
} from "../domain/issue";
import {
  TRACKING_DOCUMENTS,
  type TrackingPriority,
} from "../domain/tracking-documents";
import { trackingProjectNotFound } from "../domain/tracking-errors";
import type {
  TrackingContractorFacts,
  TrackingDirectory,
  TrackingMemberFacts,
  TrackingNamedFacts,
  TrackingTx,
} from "./ports";

const DOCUMENT = TRACKING_DOCUMENTS.issue;
const MENU = DOCUMENT.menu;

export const issueNotFound = () =>
  notFound("ISSUE_NOT_FOUND", "This Issue was not found.");

const updateNotFound = () =>
  notFound("ISSUE_UPDATE_NOT_FOUND", "This update was not found.");

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/issue-store`)
// ---------------------------------------------------------------------------

/** What a save writes besides the number, status and bookkeeping columns. */
export type IssueContent = IssueFields & {
  categoryId: string | null;
  departmentId: string | null;
  contractorId: string | null;
  /** A Team Member id (not a User id). */
  assigneeMemberId: string | null;
  siteLocation: LocationRef | null;
};

export type StoredIssue = IssueContent & {
  id: string;
  workspaceId: string;
  projectId: string;
  number: string;
  status: IssueStoredStatus;
  solvedAt: Date | null;
  /** User ids. */
  solvedBy: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  sourceInspectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** A new issue for `IssueStore.insert` (the foundation's `insertIssueRow`). */
export type NewIssue = IssueContent & {
  id: string;
  workspaceId: string;
  projectId: string;
  by: string;
  at: Date;
  status: "open" | "solved";
  sourceInspectionId: string | null;
};

/** A Progress update (CM-0019 §7). */
export type StoredIssueUpdate = {
  id: string;
  issueId: string;
  body: string | null;
  createdAt: Date;
  createdBy: string;
};

/** A lifecycle history row (`issue_events`). */
export type StoredIssueEvent = {
  id: string;
  kind: string;
  reason: string | null;
  payload: unknown;
  createdAt: Date;
  createdBy: string;
};

export type NewIssueEvent = {
  issueId: string;
  kind: IssueEventKind;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Without View all a member sees only the issues they created (`created_by`
 * is a User id) or are assigned to (`assignee_member_id` is a Team Member
 * id). Null: every issue of the Project.
 */
export type IssueVisibility = {
  userId: string;
  memberId: string | null;
} | null;

export type IssueListParams = {
  workspaceId: string;
  projectId: string;
  /** The Company's today: Pending / Delayed are derived from it. */
  today: CalendarDate;
  visibility: IssueVisibility;
  statuses?: readonly IssueStatus[];
  priorities?: readonly TrackingPriority[];
  categoryId?: string;
  assigneeMemberId?: string;
  departmentId?: string;
  contractorId?: string;
  locationType?: LocationType;
  /** The Wing, Amenity, Common Development or Location id (with its type). */
  placeId?: string;
  /** Issue Date range, both ends included. */
  from?: CalendarDate;
  to?: CalendarDate;
  /** Part of the number or the details. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

/** A new stored status; a Solved / Closed field left out keeps its value. */
export type IssueStatusChange = {
  status: IssueStoredStatus;
  solvedAt?: Date | null;
  solvedBy?: string | null;
  closedAt?: Date | null;
  closedBy?: string | null;
};

export type IssueStore = {
  find(
    db: TrackingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredIssue | null>;
  /** Locks the live rows `FOR UPDATE` (in id order) and reads them. */
  lock(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredIssue[]>;
  /** Numbers and inserts through the foundation's `insertIssueRow`. */
  insert(
    db: TrackingTx,
    row: NewIssue,
  ): Promise<{ id: string; number: string }>;
  replace(
    db: TrackingTx,
    id: string,
    content: IssueContent & { by: string; at: Date },
  ): Promise<void>;
  setStatus(
    db: TrackingTx,
    ids: readonly string[],
    change: IssueStatusChange & { by: string; at: Date },
  ): Promise<void>;
  tombstone(db: TrackingTx, id: string, by: string, at: Date): Promise<void>;
  appendEvents(
    db: TrackingTx,
    workspaceId: string,
    events: readonly NewIssueEvent[],
    by: string,
    at: Date,
  ): Promise<void>;
  /** Oldest first. */
  history(
    db: TrackingTx,
    workspaceId: string,
    issueId: string,
  ): Promise<StoredIssueEvent[]>;
  /** Newest first (by when they were recorded). */
  list(
    db: TrackingTx,
    params: IssueListParams,
  ): Promise<{ items: StoredIssue[]; hasMore: boolean; total: number }>;
  /** Live or deleted Inspection Requests by id, for "Raised from IR/…". */
  inspections(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; number: string }>>;
  insertUpdate(
    db: TrackingTx,
    row: {
      id: string;
      workspaceId: string;
      issueId: string;
      body: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  findUpdate(
    db: TrackingTx,
    workspaceId: string,
    issueId: string,
    id: string,
  ): Promise<StoredIssueUpdate | null>;
  tombstoneUpdate(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Live updates, oldest first. */
  updates(
    db: TrackingTx,
    workspaceId: string,
    issueId: string,
  ): Promise<StoredIssueUpdate[]>;
  /**
   * Attaches the poster's own uploads (files of the issue with no entry
   * yet) to a new update (`attachEntryFiles`): 400
   * `DOCUMENT_FILE_NOT_FOUND` / `ENTRY_FILES_TOO_MANY`.
   */
  attachUpdateFiles(
    db: TrackingTx,
    input: {
      workspaceId: string;
      issueId: string;
      updateId: string;
      fileIds: readonly string[];
      by: string;
    },
  ): Promise<TrackingDocumentFile[]>;
  /** Tombstones an update's files (`tombstoneEntryFiles`) and returns them. */
  removeUpdateFiles(
    db: TrackingTx,
    input: {
      workspaceId: string;
      issueId: string;
      updateId: string;
      by: string;
      at: Date;
    },
  ): Promise<TrackingDocumentFile[]>;
  /** The live files of these updates, oldest first. */
  updateFiles(
    db: TrackingTx,
    workspaceId: string,
    issueId: string,
    updateIds: readonly string[],
  ): Promise<Map<string, TrackingDocumentFile[]>>;
};

/** Checks one Issue Date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type IssueBackdatedCheck = (
  module: "issue",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type IssueDeps = {
  db: TrackingTx & {
    $transaction<T>(fn: (tx: TrackingTx) => Promise<T>): Promise<T>;
  };
  store: IssueStore;
  directory: TrackingDirectory;
  locations: LocationResolver;
  backdated: (access: MemberAccess) => Promise<IssueBackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `IssueAssigned`, `IssueUpdated`, `IssueSolved`, `IssueReopened` (no listeners until M9). */
  events: EventDispatcher;
  /**
   * The Gallery's dispatcher (`projectMediaDispatcher()`): a deleted issue's
   * files, or a deleted update's images, leave the Project Gallery
   * (`ProjectMediaRemoved`, ADR CM-0014).
   */
  media: EventDispatcher;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type IssueWriteInput = IssueInput & {
  categoryId?: string | null;
  departmentId?: string | null;
  contractorId?: string | null;
  assigneeMemberId?: string | null;
  siteLocation?: LocationRefInput | null;
};

export type IssueActions = {
  /** Update, while open. */
  edit: boolean;
  delete: boolean;
  /** Mark As Solved: Update, while open. */
  solve: boolean;
  /** Verify: Approve, while solved. */
  verify: boolean;
  /** Reopen: Reject, while solved or closed. */
  reopen: boolean;
  /** Post a Progress update: Update. */
  postUpdate: boolean;
};

type Named = { id: string; name: string | null };
type Person = { userId: string; name: string | null };

export type IssueReadModel = StoredIssue & {
  /** Pending / Delayed / Solved / Closed on the Company's today. */
  displayStatus: IssueStatus;
  category: Named | null;
  department: Named | null;
  contractor: Named | null;
  assignee: Named | null;
  createdByPerson: Person;
  solvedByPerson: Person | null;
  closedByPerson: Person | null;
  sourceInspection: { id: string; number: string } | null;
};

export type IssueHistoryItem = StoredIssueEvent & {
  by: Person;
};

export type IssueUpdateReadModel = StoredIssueUpdate & {
  by: Person;
  /** Its images, oldest first. */
  files: TrackingDocumentFile[];
  /** Uploaders' names by User id. */
  fileUploaders: ReadonlyMap<string, string>;
  /** The viewer may delete it: their own, within 24 hours. */
  canDelete: boolean;
};

export type IssueFormOptions = {
  members: TrackingMemberFacts[];
  departments: TrackingNamedFacts[];
  contractors: TrackingContractorFacts[];
  issueCategories: TrackingNamedFacts[];
};

/** What the viewer may do with an issue (screens hide the rest). */
export function issueActions(
  access: MemberAccess,
  issue: { projectId: string; status: IssueStoredStatus },
): IssueActions {
  const scope = { projectId: issue.projectId };
  const update = can(access, MENU, "update", scope);
  return {
    edit: update && issue.status === "open",
    delete: can(access, MENU, "delete", scope),
    solve: update && canTransition(issue.status, "solve"),
    verify:
      can(access, MENU, "approve", scope) &&
      canTransition(issue.status, "verify"),
    reopen:
      can(access, MENU, "reject", scope) &&
      canTransition(issue.status, "reopen"),
    postUpdate: update,
  };
}

/** Whether a member without View all sees this issue. */
export function isVisible(
  issue: { createdBy: string; assigneeMemberId: string | null },
  visibility: IssueVisibility,
): boolean {
  if (visibility == null) return true;
  return (
    issue.createdBy === visibility.userId ||
    (visibility.memberId != null &&
      issue.assigneeMemberId === visibility.memberId)
  );
}

function snapshot(issue: IssueContent) {
  return {
    issueDate: issue.issueDate,
    details: issue.details,
    priority: issue.priority,
    categoryId: issue.categoryId,
    departmentId: issue.departmentId,
    contractorId: issue.contractorId,
    assigneeMemberId: issue.assigneeMemberId,
    dueDate: issue.dueDate,
    siteLocation: issue.siteLocation,
  };
}

/** The fields an edit changed, by name (the `edited` history row). */
function changedFields(before: IssueContent, after: IssueContent): string[] {
  const a = snapshot(before) as Record<string, unknown>;
  const b = snapshot(after) as Record<string, unknown>;
  return Object.keys(b).filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
}

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim() ?? "";
  return text === "" ? null : text.toLowerCase();
};

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

export type BulkResult = {
  /** Issues the action applied to. */
  done: number;
  /** Selected issues in another state (or no longer there), left as they were. */
  skipped: number;
};

/**
 * Issues & Snags commands and queries (CM-803, ADR CM-0019 §7, §8). Every
 * write is one transaction: the row lock, the back-dated check on the
 * Issue Date (create, edit, delete), the history row and the audit event;
 * domain events are dispatched after commit. Category, Department,
 * Contractor and assignee are checked when they are set or changed, so an
 * old issue stays editable after a category is disabled.
 */
export class IssueHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: IssueDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Who the viewer may see (View all, or created by / assigned to them). */
  async visibility(access: MemberAccess): Promise<IssueVisibility> {
    if (can(access, MENU, "view_all")) return null;
    const member = await this.deps.directory.memberOfUser(
      this.deps.db,
      access.workspaceId,
      access.userId,
    );
    return { userId: access.userId, memberId: member?.id ?? null };
  }

  private async content(
    access: MemberAccess,
    projectId: string,
    input: IssueWriteInput,
    current: StoredIssue | null,
  ): Promise<IssueContent> {
    const { directory, locations, db } = this.deps;
    const workspaceId = access.workspaceId;
    const fields = issueFields(input, await this.deps.today(workspaceId));
    const categoryId = clean(input.categoryId);
    const departmentId = clean(input.departmentId);
    const contractorId = clean(input.contractorId);
    const assigneeMemberId = clean(input.assigneeMemberId);
    const changed = (id: string | null, old: string | null | undefined) =>
      id != null && id !== old ? [id] : [];
    const refs = await directory.references(db, workspaceId, projectId, {
      issueCategoryIds: changed(categoryId, current?.categoryId),
      departmentIds: changed(departmentId, current?.departmentId),
      contractorIds: changed(contractorId, current?.contractorId),
      memberIds: changed(assigneeMemberId, current?.assigneeMemberId),
    });
    if (refs.project == null) throw trackingProjectNotFound();
    if (categoryId != null && categoryId !== current?.categoryId) {
      const category = refs.issueCategories.get(categoryId);
      if (category == null)
        throw refused(
          "ISSUE_CATEGORY_NOT_FOUND",
          "This Issue Category was not found.",
          "categoryId",
        );
      if (category.disabled)
        throw refused(
          "ISSUE_CATEGORY_DISABLED",
          "This Issue Category is disabled. Choose another.",
          "categoryId",
        );
    }
    if (departmentId != null && departmentId !== current?.departmentId) {
      const department = refs.departments.get(departmentId);
      if (department == null)
        throw refused(
          "DEPARTMENT_NOT_FOUND",
          "This Department was not found.",
          "departmentId",
        );
      if (department.disabled)
        throw refused(
          "DEPARTMENT_DISABLED",
          "This Department is disabled. Choose another.",
          "departmentId",
        );
    }
    if (contractorId != null && contractorId !== current?.contractorId) {
      const contractor = refs.contractors.get(contractorId);
      if (contractor == null)
        throw refused(
          "CONTRACTOR_NOT_FOUND",
          "This Contractor was not found.",
          "contractorId",
        );
      if (!contractor.onProject || !contractor.isActive)
        throw refused(
          "CONTRACTOR_NOT_ON_PROJECT",
          "Choose an active Contractor assigned to this Project.",
          "contractorId",
        );
    }
    if (
      assigneeMemberId != null &&
      assigneeMemberId !== current?.assigneeMemberId
    ) {
      const member = refs.members.get(assigneeMemberId);
      if (member == null)
        throw refused(
          "TEAM_MEMBER_NOT_FOUND",
          "This Team Member was not found.",
          "assigneeMemberId",
        );
      if (!member.onProject || !member.active)
        throw refused(
          "ASSIGNEE_NOT_ON_PROJECT",
          "Assign the issue to an active Team Member on this Project.",
          "assigneeMemberId",
        );
    }
    let siteLocation: LocationRef | null = null;
    if (input.siteLocation != null) {
      siteLocation = locationRef(input.siteLocation);
      await locations.assertOnProject(workspaceId, projectId, siteLocation);
    }
    return {
      ...fields,
      categoryId,
      departmentId,
      contractorId,
      assigneeMemberId,
      siteLocation,
    };
  }

  private event<T extends IssueEvent["type"]>(
    type: T,
    issue: Pick<
      StoredIssue,
      "workspaceId" | "id" | "projectId" | "number" | "createdBy"
    > & { assigneeMemberId: string | null },
    by: string,
    at: Date,
  ) {
    return {
      type,
      workspaceId: issue.workspaceId,
      occurredAt: at,
      issueId: issue.id,
      projectId: issue.projectId,
      number: issue.number,
      createdBy: issue.createdBy,
      assigneeMemberId: issue.assigneeMemberId,
      by,
    };
  }

  private async dispatch(events: readonly IssueEvent[]): Promise<void> {
    if (events.length > 0) await this.deps.events.dispatch(events);
  }

  /**
   * Raises an issue (**Save**), or one fixed on the spot (**Save & Mark As
   * Solved**, which needs Create and Update). Numbered from the Issue &
   * Snag rule on its Issue Date, which the back-dated limit applies to.
   */
  async create(
    access: MemberAccess,
    input: IssueWriteInput & { projectId: string; markSolved?: boolean },
  ): Promise<string> {
    const scope = { projectId: input.projectId };
    assertCan(access, MENU, "create", scope);
    if (input.markSolved === true) assertCan(access, MENU, "update", scope);
    const content = await this.content(access, input.projectId, input, null);
    const check = await this.deps.backdated(access);
    check("issue", "create", content.issueDate);
    const id = newId();
    const at = this.clock();
    const status = input.markSolved === true ? "solved" : "open";
    const { number } = await this.deps.db.$transaction((tx) =>
      this.deps.store.insert(tx, {
        ...content,
        id,
        workspaceId: access.workspaceId,
        projectId: input.projectId,
        by: access.userId,
        at,
        status,
        sourceInspectionId: null,
      }),
    );
    const issue = {
      id,
      workspaceId: access.workspaceId,
      projectId: input.projectId,
      number,
      createdBy: access.userId,
      assigneeMemberId: content.assigneeMemberId,
    };
    await this.dispatch([
      ...(content.assigneeMemberId == null
        ? []
        : [this.event("IssueAssigned", issue, access.userId, at)]),
      ...(status === "solved"
        ? [this.event("IssueSolved", issue, access.userId, at)]
        : []),
    ]);
    return id;
  }

  /** Edits an open issue (Update). 409 `ISSUE_NOT_OPEN` once solved or closed. */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: IssueWriteInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.visible(access, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    assertEditable(current.status);
    const content = await this.content(
      access,
      current.projectId,
      input,
      current,
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    const locked = await db.$transaction(async (tx) => {
      const [row] = await store.lock(tx, access.workspaceId, [id]);
      if (row == null) throw issueNotFound();
      this.unchanged(row, expectedUpdatedAt);
      assertEditable(row.status);
      check("issue", "edit", row.issueDate);
      if (content.issueDate !== row.issueDate)
        check("issue", "edit", content.issueDate);
      const fields = changedFields(row, content);
      await store.replace(tx, id, { ...content, by: access.userId, at });
      const history: NewIssueEvent[] = [];
      if (fields.length > 0)
        history.push({ issueId: id, kind: "edited", payload: { fields } });
      if (content.assigneeMemberId !== row.assigneeMemberId)
        history.push({
          issueId: id,
          kind: "assigned",
          payload: {
            from: row.assigneeMemberId,
            to: content.assigneeMemberId,
          },
        });
      await store.appendEvents(
        tx,
        access.workspaceId,
        history,
        access.userId,
        at,
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "issue.updated",
        entityType: "issue",
        entityId: id,
        before: snapshot(row),
        after: snapshot(content),
        occurredAt: at,
      });
      return row;
    });
    if (
      content.assigneeMemberId != null &&
      content.assigneeMemberId !== locked.assigneeMemberId
    )
      await this.dispatch([
        this.event(
          "IssueAssigned",
          { ...locked, assigneeMemberId: content.assigneeMemberId },
          access.userId,
          at,
        ),
      ]);
  }

  private unchanged(issue: StoredIssue, expectedUpdatedAt: Date): void {
    if (issue.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw conflict(
        "ISSUE_CHANGED",
        "Someone changed this Issue. Reload it and try again.",
        { updatedAt: issue.updatedAt.toISOString() },
      );
  }

  /** The flag each transition needs (CM-0019 §8). */
  private static readonly FLAGS = {
    solve: "update",
    verify: "approve",
    reopen: "reject",
  } as const;

  private change(
    transition: IssueTransition,
    by: string,
    at: Date,
  ): IssueStatusChange {
    switch (transition) {
      case "solve":
        return {
          status: "solved",
          solvedAt: at,
          solvedBy: by,
          closedAt: null,
          closedBy: null,
        };
      case "verify":
        // Solved On / By are kept: a verified issue still says who solved it.
        return { status: "closed", closedAt: at, closedBy: by };
      case "reopen":
        return {
          status: "open",
          solvedAt: null,
          solvedBy: null,
          closedAt: null,
          closedBy: null,
        };
    }
  }

  /**
   * Applies one transition to the issues among `ids` (single or bulk):
   * those in another state, of another Project or not visible are skipped
   * and counted. A single action (`strict`) refuses instead of skipping.
   */
  private async transition(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    transition: IssueTransition,
    options: { strict: boolean; reason?: string },
  ): Promise<BulkResult> {
    const { db, store } = this.deps;
    assertCan(access, MENU, IssueHandlers.FLAGS[transition], { projectId });
    const visibility = await this.visibility(access);
    const at = this.clock();
    const by = access.userId;
    const unique = [...new Set(ids)];
    const { applied, skipped } = await db.$transaction(async (tx) => {
      const rows = await store.lock(tx, access.workspaceId, unique);
      const mine = rows.filter(
        (row) => row.projectId === projectId && isVisible(row, visibility),
      );
      if (options.strict) {
        const [row] = mine;
        if (row == null) throw issueNotFound();
        assertTransition(row.status, transition);
      }
      const applying = mine.filter((row) =>
        canTransition(row.status, transition),
      );
      if (applying.length > 0) {
        const change = this.change(transition, by, at);
        await store.setStatus(
          tx,
          applying.map((row) => row.id),
          { ...change, by, at },
        );
        const kind: IssueEventKind =
          transition === "solve"
            ? "solved"
            : transition === "verify"
              ? "closed"
              : "reopened";
        await store.appendEvents(
          tx,
          access.workspaceId,
          applying.map((row) => ({
            issueId: row.id,
            kind,
            reason: options.reason ?? null,
            payload: transition === "reopen" ? { from: row.status } : undefined,
          })),
          by,
          at,
        );
        for (const row of applying)
          await recordAudit(tx, {
            workspaceId: access.workspaceId,
            actorUserId: by,
            action: `issue.${kind}`,
            entityType: "issue",
            entityId: row.id,
            before: { status: row.status },
            after: {
              status: change.status,
              ...(options.reason == null ? {} : { reason: options.reason }),
            },
            occurredAt: at,
          });
      }
      return {
        applied: applying,
        skipped: unique.length - applying.length,
      };
    });
    if (transition === "solve")
      await this.dispatch(
        applied.map((row) => this.event("IssueSolved", row, by, at)),
      );
    if (transition === "reopen")
      await this.dispatch(
        applied.map((row) => ({
          ...this.event("IssueReopened", row, by, at),
          reason: options.reason ?? "",
        })),
      );
    return { done: applied.length, skipped };
  }

  /** **Mark As Solved** (Update): `open → solved`, recording Solved On / By. */
  async solve(access: MemberAccess, id: string): Promise<void> {
    const issue = await this.visible(access, id);
    await this.transition(access, issue.projectId, [id], "solve", {
      strict: true,
    });
  }

  /** **Verify** (Approve): `solved → closed`, recording Closed On / By. */
  async verify(access: MemberAccess, id: string): Promise<void> {
    const issue = await this.visible(access, id);
    await this.transition(access, issue.projectId, [id], "verify", {
      strict: true,
    });
  }

  /** **Reopen** (Reject) with a reason: `solved | closed → open`, clearing Solved / Closed. */
  async reopen(
    access: MemberAccess,
    id: string,
    rawReason: string,
  ): Promise<void> {
    const issue = await this.visible(access, id);
    assertCan(access, MENU, "reject", { projectId: issue.projectId });
    const reason = reopenReason(rawReason);
    await this.transition(access, issue.projectId, [id], "reopen", {
      strict: true,
      reason,
    });
  }

  /** Bulk **Mark As Solved**: every selected open issue; the rest are skipped. */
  bulkSolve(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
  ): Promise<BulkResult> {
    return this.transition(access, projectId, ids, "solve", { strict: false });
  }

  /** Bulk **Verify**: every selected solved issue; the rest are skipped. */
  bulkVerify(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
  ): Promise<BulkResult> {
    return this.transition(access, projectId, ids, "verify", {
      strict: false,
    });
  }

  /**
   * Deletes an issue (a tombstone; its number is never reused) with its
   * files' Gallery tiles. Needs Delete; the back-dated edit limit applies
   * to its Issue Date.
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.visible(access, id);
    assertCan(access, MENU, "delete", { projectId: current.projectId });
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw issueNotFound();
      this.unchanged(locked, expectedUpdatedAt);
      check("issue", "edit", locked.issueDate);
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "issue.deleted",
        entityType: "issue",
        entityId: id,
        before: {
          number: locked.number,
          status: locked.status,
          ...snapshot(locked),
        },
        occurredAt: at,
      });
    });
    await this.removeFromGallery([
      trackingDocumentMediaRemoved({
        workspaceId: access.workspaceId,
        projectId: current.projectId,
        type: "issue",
        documentId: id,
        at,
      }),
    ]);
  }

  /**
   * Tells the Project Gallery files went away, after commit. The Gallery is
   * an index: a failure is logged, never turned into an error.
   */
  private async removeFromGallery(events: readonly DomainEvent[]) {
    if (events.length === 0) return;
    try {
      await this.deps.media.dispatch(events);
    } catch (error) {
      console.error("Could not update the Project Gallery", error);
    }
  }

  // -------------------------------------------------------------------------
  // The Progress thread
  // -------------------------------------------------------------------------

  /**
   * Posts a Progress update: a comment, images, or both. The images are
   * uploaded to the issue first and named by `fileIds` (the poster's own,
   * not yet posted); they are attached in the same transaction. Anyone
   * who sees the issue and holds Update; any status.
   */
  async postUpdate(
    access: MemberAccess,
    issueId: string,
    input: { body?: string | null; fileIds?: readonly string[] },
  ): Promise<string> {
    const issue = await this.visible(access, issueId);
    assertCan(access, MENU, "update", { projectId: issue.projectId });
    const fileIds = [...new Set(input.fileIds ?? [])];
    const body = updateBody(input.body, fileIds.length > 0);
    const id = newId();
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [
        issueId,
      ]);
      if (locked == null) throw issueNotFound();
      await this.deps.store.insertUpdate(tx, {
        id,
        workspaceId: access.workspaceId,
        issueId,
        body,
        by: access.userId,
        at,
      });
      await this.deps.store.attachUpdateFiles(tx, {
        workspaceId: access.workspaceId,
        issueId,
        updateId: id,
        fileIds,
        by: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "issue.update_posted",
        entityType: "issue",
        entityId: issueId,
        after: { updateId: id, body, fileIds },
        occurredAt: at,
      });
    });
    await this.dispatch([
      { ...this.event("IssueUpdated", issue, access.userId, at), updateId: id },
    ]);
    return id;
  }

  /** The author deletes their own update within 24 hours (with its images). */
  async deleteUpdate(
    access: MemberAccess,
    issueId: string,
    updateId: string,
  ): Promise<void> {
    await this.visible(access, issueId);
    const { db, store } = this.deps;
    const at = this.clock();
    const removed = await db.$transaction(async (tx) => {
      const update = await store.findUpdate(
        tx,
        access.workspaceId,
        issueId,
        updateId,
      );
      if (update == null) throw updateNotFound();
      assertCanDeleteUpdate(update, access.userId, at);
      await store.tombstoneUpdate(tx, updateId, access.userId, at);
      const files = await store.removeUpdateFiles(tx, {
        workspaceId: access.workspaceId,
        issueId,
        updateId,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "issue.update_deleted",
        entityType: "issue",
        entityId: issueId,
        before: { updateId, body: update.body },
        occurredAt: at,
      });
      return files;
    });
    await this.removeFromGallery(trackingFilesMediaRemoved(removed, at));
  }

  async updates(
    access: MemberAccess,
    issueId: string,
  ): Promise<IssueUpdateReadModel[]> {
    await this.visible(access, issueId);
    const rows = await this.deps.store.updates(
      this.deps.db,
      access.workspaceId,
      issueId,
    );
    const files = await this.deps.store.updateFiles(
      this.deps.db,
      access.workspaceId,
      issueId,
      rows.map((row) => row.id),
    );
    const names = await this.deps.directory.names(
      this.deps.db,
      access.workspaceId,
      {
        userIds: [
          ...rows.map((row) => row.createdBy),
          ...[...files.values()].flat().map((file) => file.createdBy),
        ],
      },
    );
    const now = this.clock();
    return rows.map((row) => ({
      ...row,
      files: files.get(row.id) ?? [],
      fileUploaders: names.users,
      by: {
        userId: row.createdBy,
        name: names.users.get(row.createdBy) ?? null,
      },
      canDelete: canDeleteUpdate(row, access.userId, now),
    }));
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** A live issue of the Company (404 otherwise), visibility not checked. */
  async find(workspaceId: string, id: string): Promise<StoredIssue> {
    const issue = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (issue == null) throw issueNotFound();
    return issue;
  }

  /** A live issue the viewer may see; 404 for one they may not. */
  async visible(access: MemberAccess, id: string): Promise<StoredIssue> {
    const issue = await this.find(access.workspaceId, id);
    if (!isVisible(issue, await this.visibility(access))) throw issueNotFound();
    return issue;
  }

  async readModels(
    workspaceId: string,
    rows: readonly StoredIssue[],
    today: CalendarDate,
  ): Promise<IssueReadModel[]> {
    const { directory, store, db } = this.deps;
    const ids = (pick: (row: StoredIssue) => string | null) =>
      rows.flatMap((row) => {
        const id = pick(row);
        return id == null ? [] : [id];
      });
    const [names, inspections] = await Promise.all([
      directory.names(db, workspaceId, {
        issueCategoryIds: ids((row) => row.categoryId),
        departmentIds: ids((row) => row.departmentId),
        contractorIds: ids((row) => row.contractorId),
        memberIds: ids((row) => row.assigneeMemberId),
        userIds: [
          ...ids((row) => row.createdBy),
          ...ids((row) => row.solvedBy),
          ...ids((row) => row.closedBy),
        ],
      }),
      store.inspections(
        db,
        workspaceId,
        ids((row) => row.sourceInspectionId),
      ),
    ]);
    const named = (id: string | null, map: ReadonlyMap<string, string>) =>
      id == null ? null : { id, name: map.get(id) ?? null };
    const person = (userId: string | null) =>
      userId == null ? null : { userId, name: names.users.get(userId) ?? null };
    return rows.map((row) => ({
      ...row,
      displayStatus: issueStatus(row, today),
      category: named(row.categoryId, names.issueCategories),
      department: named(row.departmentId, names.departments),
      contractor: named(row.contractorId, names.contractors),
      assignee: named(row.assigneeMemberId, names.members),
      createdByPerson: person(row.createdBy) ?? {
        userId: row.createdBy,
        name: null,
      },
      solvedByPerson: person(row.solvedBy),
      closedByPerson: person(row.closedBy),
      sourceInspection:
        row.sourceInspectionId == null
          ? null
          : (inspections.get(row.sourceInspectionId) ?? null),
    }));
  }

  /** One issue the viewer may see, with names and its lifecycle history. */
  async get(
    access: MemberAccess,
    id: string,
  ): Promise<IssueReadModel & { history: IssueHistoryItem[] }> {
    const issue = await this.visible(access, id);
    const today = await this.deps.today(access.workspaceId);
    const [[model], history] = await Promise.all([
      this.readModels(access.workspaceId, [issue], today),
      this.history(access.workspaceId, id),
    ]);
    if (model == null) throw issueNotFound();
    return { ...model, history };
  }

  private async history(
    workspaceId: string,
    id: string,
  ): Promise<IssueHistoryItem[]> {
    const { db, store, directory } = this.deps;
    const rows = await store.history(db, workspaceId, id);
    const memberIds = rows.flatMap((row) => {
      const payload = row.payload as { from?: unknown; to?: unknown } | null;
      return row.kind === "assigned" && payload != null
        ? [payload.from, payload.to].filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    });
    const names = await directory.names(db, workspaceId, {
      userIds: rows.map((row) => row.createdBy),
      memberIds,
    });
    return rows.map((row) => {
      const payload = row.payload as Record<string, unknown> | null;
      const memberName = (value: unknown) =>
        typeof value === "string" ? (names.members.get(value) ?? null) : null;
      return {
        ...row,
        payload:
          row.kind === "assigned" && payload != null
            ? {
                ...payload,
                fromName: memberName(payload["from"]),
                toName: memberName(payload["to"]),
              }
            : row.payload,
        by: {
          userId: row.createdBy,
          name: names.users.get(row.createdBy) ?? null,
        },
      };
    });
  }

  /** A page of the Project's issues the viewer may see. */
  async list(
    access: MemberAccess,
    params: Omit<IssueListParams, "workspaceId" | "today" | "visibility">,
  ) {
    const today = await this.deps.today(access.workspaceId);
    const page = await this.deps.store.list(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
      today,
      visibility: await this.visibility(access),
    });
    return {
      ...page,
      items: await this.readModels(access.workspaceId, page.items, today),
    };
  }

  /** Assignees, Departments, Contractors and enabled Issue Categories on the Project. */
  async formOptions(
    workspaceId: string,
    projectId: string,
  ): Promise<IssueFormOptions> {
    const options = await this.deps.directory.options(
      this.deps.db,
      workspaceId,
      projectId,
      ["members", "departments", "contractors", "issueCategories"],
    );
    return {
      members: options.members,
      departments: options.departments,
      contractors: options.contractors,
      issueCategories: options.issueCategories,
    };
  }
}
