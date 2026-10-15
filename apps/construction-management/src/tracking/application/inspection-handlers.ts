import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  bulkIds,
  requiredText,
  type ApprovalState,
} from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
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
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import {
  trackingDocumentMediaRemoved,
  trackingFilesMediaRemoved,
  type TrackingDocumentFile,
} from "../domain/document-files";
import type { InspectionDecided, InspectionRequested } from "../domain/events";
import {
  assertPending,
  assertReinspectable,
  decideInspection,
  inspectionFields,
  observationBody,
  reinspectionDraft,
  remarkBody,
  SNAG_CATEGORY_NAME,
  snagDetails,
  type InspectionDecision,
  type InspectionFields,
  type InspectionInput,
  type InspectionStatus,
  type ReinspectionDraft,
} from "../domain/inspection";
import { TRACKING_DOCUMENTS } from "../domain/tracking-documents";
import { trackingProjectNotFound } from "../domain/tracking-errors";
import type { InsertedIssue, NewIssueRow } from "../infrastructure/issue-rows";
import type {
  BackdatedCheck,
  TrackingActor,
} from "../infrastructure/tracking-guards";
import type {
  TrackingDirectory,
  TrackingDrawingLinks,
  TrackingOptions,
  TrackingReferences,
  TrackingTx,
} from "./ports";

const DOCUMENT = TRACKING_DOCUMENTS.inspection;
const MENU = DOCUMENT.menu;
const ISSUE_MENU = TRACKING_DOCUMENTS.issue.menu;
const BACKDATED = "inspection_request" as const;
const SEQUENCE = "inspection_request" as const;

export const inspectionNotFound = () =>
  notFound("INSPECTION_NOT_FOUND", "This Inspection Request was not found.");

const observationNotFound = () =>
  notFound("OBSERVATION_NOT_FOUND", "This observation was not found.");

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-inspection-store`)
// ---------------------------------------------------------------------------

/** What a save writes besides the number, status and bookkeeping. */
export type InspectionContent = InspectionFields & {
  siteLocation: LocationRef | null;
};

export type StoredInspection = InspectionContent &
  ApprovalState & {
    id: string;
    workspaceId: string;
    projectId: string;
    /** `IR/26-27/00001`. */
    number: string;
    status: InspectionStatus;
    reinspectionOfId: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
  };

/** Another request, named on a detail page. */
export type InspectionRef = {
  id: string;
  number: string;
  status: InspectionStatus;
};

/** A live Issue & Snag raised from a rejection. */
export type InspectionSnagRef = { id: string; number: string };

export type StoredObservation = {
  id: string;
  inspectionId: string;
  body: string | null;
  createdAt: Date;
  createdBy: string;
};

export type StoredRemark = {
  id: string;
  inspectionId: string;
  body: string;
  createdAt: Date;
  createdBy: string;
};

/** The place a list is filtered by: a Wing, Amenity, Common Development or Location. */
export type InspectionLocationFilter = { type: LocationType; id: string };

export type InspectionListParams = {
  workspaceId: string;
  projectId: string;
  status?: InspectionStatus;
  departmentId?: string;
  contractorId?: string;
  inspectorMemberId?: string;
  location?: InspectionLocationFilter;
  /** Inspection Date on or after. */
  from?: CalendarDate;
  /** Inspection Date on or before. */
  to?: CalendarDate;
  /** Part of the number or the description of work. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type InspectionStatusCounts = Record<InspectionStatus, number>;

export type InspectionStore = {
  find(
    db: TrackingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredInspection | null>;
  /** Locks the live rows `FOR UPDATE` and reads them. */
  lock(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredInspection[]>;
  insert(
    db: TrackingTx,
    row: InspectionContent & {
      id: string;
      workspaceId: string;
      projectId: string;
      number: string;
      reinspectionOfId: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  replace(
    db: TrackingTx,
    id: string,
    content: InspectionContent & { by: string; at: Date },
  ): Promise<void>;
  setDecision(
    db: TrackingTx,
    id: string,
    state: ApprovalState,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(db: TrackingTx, id: string, by: string, at: Date): Promise<void>;
  /**
   * Newest first (by when they were raised), with the total and the
   * counts by status under the other filters.
   */
  list(
    db: TrackingTx,
    params: InspectionListParams,
  ): Promise<{
    items: StoredInspection[];
    hasMore: boolean;
    total: number;
    counts: InspectionStatusCounts;
  }>;
  /** Live requests by id. */
  refs(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, InspectionRef>>;
  /** Live re-inspections of each request, oldest first. */
  reinspections(
    db: TrackingTx,
    workspaceId: string,
    originalIds: readonly string[],
  ): Promise<Map<string, InspectionRef[]>>;
  /** Live snags raised from each request, oldest first. */
  snags(
    db: TrackingTx,
    workspaceId: string,
    inspectionIds: readonly string[],
  ): Promise<Map<string, InspectionSnagRef[]>>;
  observations(
    db: TrackingTx,
    workspaceId: string,
    inspectionId: string,
  ): Promise<StoredObservation[]>;
  findObservation(
    db: TrackingTx,
    workspaceId: string,
    inspectionId: string,
    observationId: string,
  ): Promise<StoredObservation | null>;
  insertObservation(
    db: TrackingTx,
    row: StoredObservation & { workspaceId: string },
  ): Promise<void>;
  tombstoneObservation(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  remarks(
    db: TrackingTx,
    workspaceId: string,
    inspectionId: string,
  ): Promise<StoredRemark[]>;
  insertRemark(
    db: TrackingTx,
    row: StoredRemark & { workspaceId: string },
  ): Promise<void>;
};

export type InspectionDeps = {
  db: TrackingTx & {
    $transaction<T>(fn: (tx: TrackingTx) => Promise<T>): Promise<T>;
  };
  store: InspectionStore;
  directory: TrackingDirectory;
  drawingLinks: TrackingDrawingLinks;
  locations: LocationResolver;
  backdated: (actor: TrackingActor) => Promise<BackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** The shared Issue & Snag writer (`insertIssueRow`), in the caller's transaction. */
  raiseSnag: (tx: TrackingTx, row: NewIssueRow) => Promise<InsertedIssue>;
  /** `InspectionRequested` and `InspectionDecided`, after commit. */
  events: EventDispatcher;
  /** Observations' files (`attachEntryFiles` and friends of CM-801). */
  files: InspectionEntryFiles;
  /** The Project Gallery (`ProjectMediaRemoved` after a delete). */
  media: EventDispatcher;
  clock?: () => Date;
};

/** An observation's files: uploaded to the request first, attached when it is posted. */
export type InspectionEntryFiles = {
  attach(
    tx: TrackingTx,
    input: {
      workspaceId: string;
      inspectionId: string;
      observationId: string;
      fileIds: readonly string[];
      by: string;
    },
  ): Promise<TrackingDocumentFile[]>;
  tombstone(
    tx: TrackingTx,
    input: {
      workspaceId: string;
      inspectionId: string;
      observationId: string;
      by: string;
      at: Date;
    },
  ): Promise<TrackingDocumentFile[]>;
  ofObservations(
    db: TrackingTx,
    input: {
      workspaceId: string;
      inspectionId: string;
      observationIds: readonly string[];
    },
  ): Promise<Map<string, TrackingDocumentFile[]>>;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type InspectionWriteInput = InspectionInput & {
  siteLocation?: LocationRefInput | null;
};

/** Who is looking: their access and their own Team Member (the inspector check). */
export type InspectionViewer = {
  access: MemberAccess;
  memberId: string | null;
};

export type InspectionActions = {
  /** Update, while pending. */
  edit: boolean;
  /** Delete, while pending. */
  delete: boolean;
  approve: boolean;
  reject: boolean;
  /** The inspector or Update, while pending. */
  observe: boolean;
  /** Anyone who can read it, any time. */
  remark: boolean;
  /** Create, on a rejected request with no live re-inspection. */
  reinspect: boolean;
  /** Issues & Snags Create: the reject dialog offers **Also raise a snag**. */
  raiseSnag: boolean;
  print: boolean;
};

export type InspectionDrawingReadModel = {
  id: string;
  name: string | null;
  /** Null once the drawing is gone (its name is kept). */
  albumId: string | null;
  albumName: string | null;
  revision: number | null;
};

export type InspectionReadModel = StoredInspection & {
  departmentName: string | null;
  contractorName: string | null;
  inspectorName: string | null;
  drawings: InspectionDrawingReadModel[];
  reinspectionOf: InspectionRef | null;
  reinspections: InspectionRef[];
  snags: InspectionSnagRef[];
  createdByName: string | null;
  decidedByName: string | null;
};

export type ObservationReadModel = StoredObservation & {
  createdByName: string | null;
  /** Photos and files posted with it, oldest first. */
  files: TrackingDocumentFile[];
  /** The author, while the request is pending. */
  canDelete: boolean;
};

export type RemarkReadModel = StoredRemark & { createdByName: string | null };

export type InspectionFormOptions = Pick<
  TrackingOptions,
  "members" | "departments" | "contractors" | "drawings"
>;

export type InspectionBulkOutcome = {
  /** Requests decided now. */
  decided: string[];
  /** Selected requests left alone: already decided, deleted or another Project's. */
  skipped: number;
  /** One per rejected request when **Also raise a snag** was ticked. */
  snags: (InsertedIssue & { inspectionId: string })[];
};

/** What the viewer may do with a request (screens hide the rest). */
export function inspectionActions(
  viewer: InspectionViewer,
  inspection: {
    projectId: string;
    status: InspectionStatus;
    inspectorMemberId: string | null;
  },
  hasLiveReinspection: boolean,
): InspectionActions {
  const { access } = viewer;
  const scope = { projectId: inspection.projectId };
  const pending = inspection.status === "pending";
  const update = can(access, MENU, "update", scope);
  const inspector =
    viewer.memberId != null && viewer.memberId === inspection.inspectorMemberId;
  return {
    edit: pending && update,
    delete: pending && can(access, MENU, "delete", scope),
    approve: pending && can(access, MENU, "approve", scope),
    reject: pending && can(access, MENU, "reject", scope),
    observe: pending && (update || inspector),
    remark: can(access, MENU, "read", scope),
    reinspect:
      inspection.status === "rejected" &&
      !hasLiveReinspection &&
      can(access, MENU, "create", scope),
    raiseSnag: can(access, ISSUE_MENU, "create", scope),
    print: can(access, MENU, "print", scope),
  };
}

function snapshot(content: InspectionContent) {
  return {
    inspectionDate: content.inspectionDate,
    inspectionTime: content.inspectionTime,
    departmentId: content.departmentId,
    contractorId: content.contractorId,
    inspectorMemberId: content.inspectorMemberId,
    workDescription: content.workDescription,
    siteLocation: content.siteLocation,
    drawingIds: content.drawingIds,
  };
}

function changed(row: StoredInspection, expectedUpdatedAt: Date | undefined) {
  if (
    expectedUpdatedAt != null &&
    row.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  )
    throw conflict(
      "INSPECTION_CHANGED",
      "Someone changed this Inspection Request. Reload it and try again.",
      { updatedAt: row.updatedAt.toISOString() },
    );
}

function reinspectionExists(existing: InspectionRef): DomainError {
  return conflict(
    "INSPECTION_REINSPECTION_EXISTS",
    `This request is already being inspected again as ${existing.number}.`,
    { inspectionId: existing.id, number: existing.number },
  );
}

function actor(access: MemberAccess): TrackingActor {
  return {
    workspaceId: access.workspaceId,
    userId: access.userId,
    role: access.role,
  };
}

const invalid = (
  code: string,
  message: string,
  field: string,
  ids?: string[],
) =>
  new DomainError(code, message, {
    details: ids == null ? { field } : { field, ids },
  });

/**
 * Inspection Request commands and queries (CM-804, ADR CM-0019 §9, §10).
 * Every write is one transaction with its audit event: create takes the
 * next **InspectionRequest** number on the Inspection Date (back-dated
 * policy on it); edit and delete lock the row and refuse a decided one
 * (409 `INSPECTION_DECIDED`); a reject can raise a snag through the shared
 * Issue & Snag writer in the same transaction. References are checked
 * through the `TrackingDirectory` when they are set or changed, so an old
 * request stays editable after a Contractor leaves the Project.
 */
export class InspectionHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: InspectionDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** The viewer's Team Member, once per request. */
  async viewer(access: MemberAccess): Promise<InspectionViewer> {
    const member = await this.deps.directory.memberOfUser(
      this.deps.db,
      access.workspaceId,
      access.userId,
    );
    return { access, memberId: member?.id ?? null };
  }

  /**
   * New picks must be live, enabled / active and on the Project; an
   * unchanged old pick may stay as it is.
   */
  private checkReferences(
    fields: InspectionFields,
    refs: TrackingReferences,
    current: StoredInspection | null,
  ): void {
    const { inspectorMemberId, departmentId, contractorId } = fields;
    if (
      inspectorMemberId != null &&
      inspectorMemberId !== current?.inspectorMemberId
    ) {
      const member = refs.members.get(inspectorMemberId);
      if (member == null)
        throw invalid(
          "INSPECTOR_NOT_FOUND",
          "This Team Member was not found.",
          "inspectorMemberId",
        );
      if (!member.active || !member.onProject)
        throw invalid(
          "INSPECTOR_NOT_ON_PROJECT",
          "Choose an active Team Member on this Project as the inspector.",
          "inspectorMemberId",
        );
    }
    if (departmentId != null && departmentId !== current?.departmentId) {
      const department = refs.departments.get(departmentId);
      if (department == null)
        throw invalid(
          "DEPARTMENT_NOT_FOUND",
          "This Department was not found.",
          "departmentId",
        );
      if (department.disabled)
        throw invalid(
          "DEPARTMENT_DISABLED",
          "This Department is disabled. Choose another.",
          "departmentId",
        );
    }
    if (contractorId != null && contractorId !== current?.contractorId) {
      const contractor = refs.contractors.get(contractorId);
      if (contractor == null)
        throw invalid(
          "CONTRACTOR_NOT_FOUND",
          "This Contractor was not found.",
          "contractorId",
        );
      if (!contractor.isActive || !contractor.onProject)
        throw invalid(
          "CONTRACTOR_NOT_ON_PROJECT",
          "Choose an active Contractor assigned to this Project.",
          "contractorId",
        );
    }
    const linked = new Set(current?.drawingIds ?? []);
    const missing = fields.drawingIds.filter((id) => {
      if (linked.has(id)) return false;
      return refs.drawings.get(id)?.onProject !== true;
    });
    if (missing.length > 0)
      throw invalid(
        "DRAWING_NOT_FOUND",
        missing.length === 1
          ? "This drawing is not one of the Project's Drawings."
          : "Some drawings are not the Project's Drawings.",
        "drawingIds",
        missing,
      );
  }

  private async content(
    access: MemberAccess,
    projectId: string,
    input: InspectionWriteInput,
    current: StoredInspection | null,
  ): Promise<InspectionContent> {
    const { directory, locations, db } = this.deps;
    const fields = inspectionFields(input);
    const refs = await directory.references(db, access.workspaceId, projectId, {
      memberIds:
        fields.inspectorMemberId == null ? [] : [fields.inspectorMemberId],
      departmentIds: fields.departmentId == null ? [] : [fields.departmentId],
      contractorIds: fields.contractorId == null ? [] : [fields.contractorId],
      drawingIds: fields.drawingIds,
    });
    if (refs.project == null) throw trackingProjectNotFound();
    this.checkReferences(fields, refs, current);
    let siteLocation: LocationRef | null = null;
    if (input.siteLocation != null) {
      siteLocation = locationRef(input.siteLocation);
      await locations.assertOnProject(
        access.workspaceId,
        projectId,
        siteLocation,
      );
    }
    return { ...fields, siteLocation };
  }

  /**
   * Raises a request, or a re-inspection of a rejected one
   * (`reinspectionOfId`, Create on the same Project; at most one live
   * re-inspection per request).
   */
  async create(
    access: MemberAccess,
    input: InspectionWriteInput & {
      projectId: string;
      reinspectionOfId?: string | null;
    },
  ): Promise<string> {
    const { projectId } = input;
    assertCan(access, MENU, "create", { projectId });
    const { db, store } = this.deps;
    const content = await this.content(access, projectId, input, null);
    const originalId = input.reinspectionOfId?.trim() ?? "";
    const reinspectionOfId = originalId === "" ? null : originalId;
    if (reinspectionOfId != null) {
      const original = await store.find(
        db,
        access.workspaceId,
        reinspectionOfId,
      );
      if (original == null)
        throw invalid(
          "REINSPECTION_NOT_FOUND",
          "The rejected Inspection Request was not found.",
          "reinspectionOfId",
        );
      assertReinspectable(original, projectId);
    }
    const check = await this.deps.backdated(actor(access));
    const id = newId();
    const at = this.clock();
    const number = await db.$transaction(async (tx) => {
      check(BACKDATED, "create", content.inspectionDate);
      if (reinspectionOfId != null) {
        const [original] = await store.lock(tx, access.workspaceId, [
          reinspectionOfId,
        ]);
        if (original == null)
          throw invalid(
            "REINSPECTION_NOT_FOUND",
            "The rejected Inspection Request was not found.",
            "reinspectionOfId",
          );
        assertReinspectable(original, projectId);
        const existing = (
          await store.reinspections(tx, access.workspaceId, [reinspectionOfId])
        ).get(reinspectionOfId)?.[0];
        if (existing != null) throw reinspectionExists(existing);
      }
      const allocated = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: SEQUENCE,
        projectId,
        date: content.inspectionDate,
        by: access.userId,
      });
      await store.insert(tx, {
        ...content,
        id,
        workspaceId: access.workspaceId,
        projectId,
        number: allocated.number,
        reinspectionOfId,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inspection.created",
        entityType: "inspection",
        entityId: id,
        after: {
          number: allocated.number,
          reinspectionOfId,
          ...snapshot(content),
        },
        occurredAt: at,
      });
      return allocated.number;
    });
    const event: InspectionRequested = {
      type: "InspectionRequested",
      workspaceId: access.workspaceId,
      occurredAt: at,
      inspectionId: id,
      projectId,
      number,
      inspectorMemberId: content.inspectorMemberId,
      reinspectionOfId,
      requestedBy: access.userId,
    };
    await this.deps.events.dispatch([event]);
    return id;
  }

  /** Edits a pending request (Update). The back-dated edit limit applies to the old and the new date. */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: InspectionWriteInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    assertPending(current.status, "edit");
    const content = await this.content(
      access,
      current.projectId,
      input,
      current,
    );
    const check = await this.deps.backdated(actor(access));
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw inspectionNotFound();
      changed(locked, expectedUpdatedAt);
      assertPending(locked.status, "edit");
      check(BACKDATED, "edit", locked.inspectionDate);
      if (content.inspectionDate !== locked.inspectionDate)
        check(BACKDATED, "edit", content.inspectionDate);
      await store.replace(tx, id, { ...content, by: access.userId, at });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inspection.updated",
        entityType: "inspection",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(content),
        occurredAt: at,
      });
    });
  }

  /** Deletes a pending request (Delete; a tombstone, the number is never reused). */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<{ projectId: string; at: Date }> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "delete", { projectId: current.projectId });
    const check = await this.deps.backdated(actor(access));
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw inspectionNotFound();
      changed(locked, expectedUpdatedAt);
      assertPending(locked.status, "delete");
      check(BACKDATED, "edit", locked.inspectionDate);
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inspection.deleted",
        entityType: "inspection",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
    });
    await this.removeFromGallery([
      trackingDocumentMediaRemoved({
        workspaceId: access.workspaceId,
        projectId: current.projectId,
        type: "inspection",
        documentId: id,
        at,
      }),
    ]);
    return { projectId: current.projectId, at };
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

  /**
   * Approve (A) or Reject (J, with a reason) one pending request; 409
   * `INSPECTION_NOT_PENDING` once decided. **Also raise a snag** needs
   * Issues & Snags Create and raises it in the same transaction.
   */
  async decide(
    access: MemberAccess,
    id: string,
    decision: InspectionDecision,
    options: { raiseSnag?: boolean; expectedUpdatedAt?: Date } = {},
  ): Promise<InsertedIssue | null> {
    const current = await this.find(access.workspaceId, id);
    const outcome = await this.decideMany(
      access,
      current.projectId,
      [id],
      decision,
      { raiseSnag: options.raiseSnag === true, bulk: false },
      options.expectedUpdatedAt,
    );
    return outcome.snags[0] ?? null;
  }

  /**
   * Bulk approve or reject (one reason) on one Project: decides the
   * selected **pending** requests and skips and counts the rest (CM-0019
   * §9). With **Also raise a snag**, one snag per rejected request.
   */
  async bulkDecide(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    decision: InspectionDecision,
    raiseSnag: boolean,
  ): Promise<InspectionBulkOutcome> {
    const unique = bulkIds(ids);
    // One reason for all: a missing one is the request's fault, not each one's.
    const checked: InspectionDecision = decision.approve
      ? decision
      : {
          approve: false,
          reason: requiredText(
            decision.reason,
            "REJECTION_REASON_REQUIRED",
            "reason",
          ),
        };
    return this.decideMany(access, projectId, unique, checked, {
      raiseSnag,
      bulk: true,
    });
  }

  /** The enabled "Quality" Issue Category, or null when renamed, disabled or deleted. */
  private async qualityCategory(
    workspaceId: string,
    projectId: string,
  ): Promise<string | null> {
    const options = await this.deps.directory.options(
      this.deps.db,
      workspaceId,
      projectId,
      ["issueCategories"],
    );
    const wanted = SNAG_CATEGORY_NAME.toLowerCase();
    return (
      options.issueCategories.find(
        (item) => !item.disabled && item.name.trim().toLowerCase() === wanted,
      )?.id ?? null
    );
  }

  private async decideMany(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    decision: InspectionDecision,
    options: { raiseSnag: boolean; bulk: boolean },
    expectedUpdatedAt?: Date,
  ): Promise<InspectionBulkOutcome> {
    const scope = { projectId };
    assertCan(access, MENU, decision.approve ? "approve" : "reject", scope);
    const raiseSnag = options.raiseSnag && !decision.approve;
    if (raiseSnag && !can(access, ISSUE_MENU, "create", scope))
      throw forbidden(
        "SNAG_NOT_ALLOWED",
        "You cannot raise Issues & Snags on this Project. Reject without a snag, or ask the Owner for Issues & Snags Create.",
      );
    const { db, store } = this.deps;
    const [categoryId, today] = raiseSnag
      ? await Promise.all([
          this.qualityCategory(access.workspaceId, projectId),
          this.deps.today(access.workspaceId),
        ])
      : [null, null];
    const at = this.clock();
    const by = { userId: access.userId, at };
    const decidedRows: { row: StoredInspection; state: ApprovalState }[] = [];
    const snags: InspectionBulkOutcome["snags"] = [];
    let skipped = 0;
    await db.$transaction(async (tx) => {
      const locked = new Map(
        (await store.lock(tx, access.workspaceId, ids)).map((row) => [
          row.id,
          row,
        ]),
      );
      for (const id of ids) {
        const row = locked.get(id);
        if (row?.projectId !== projectId) {
          if (!options.bulk) throw inspectionNotFound();
          skipped += 1;
          continue;
        }
        if (!options.bulk) changed(row, expectedUpdatedAt);
        if (options.bulk && row.status !== "pending") {
          skipped += 1;
          continue;
        }
        const state = decideInspection(row, decision, by);
        await store.setDecision(tx, id, state, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: decision.approve
            ? "inspection.approved"
            : "inspection.rejected",
          entityType: "inspection",
          entityId: id,
          after: {
            status: state.status,
            rejectionReason: state.rejectionReason,
            bulk: options.bulk,
            raiseSnag,
          },
          occurredAt: at,
        });
        decidedRows.push({ row, state });
        if (raiseSnag && today != null) {
          const snag = await this.deps.raiseSnag(tx, {
            workspaceId: access.workspaceId,
            projectId,
            by: access.userId,
            at,
            issueDate: today,
            details: snagDetails(row.number, state.rejectionReason ?? ""),
            priority: null,
            categoryId,
            departmentId: row.departmentId,
            contractorId: row.contractorId,
            assigneeMemberId: null,
            dueDate: null,
            siteLocation: row.siteLocation,
            status: "open",
            sourceInspectionId: row.id,
          });
          snags.push({ ...snag, inspectionId: row.id });
        }
      }
    });
    const events: InspectionDecided[] = decidedRows.map(({ row, state }) => ({
      type: "InspectionDecided",
      workspaceId: access.workspaceId,
      occurredAt: at,
      inspectionId: row.id,
      projectId,
      number: row.number,
      status: state.status === "approved" ? "approved" : "rejected",
      reason: state.rejectionReason,
      decidedBy: access.userId,
      requestedBy: row.createdBy,
      snagIssueId:
        snags.find((snag) => snag.inspectionId === row.id)?.id ?? null,
    }));
    await this.deps.events.dispatch(events);
    return {
      decided: decidedRows.map(({ row }) => row.id),
      skipped,
      snags,
    };
  }

  // -------------------------------------------------------------------------
  // Observations and remarks
  // -------------------------------------------------------------------------

  /**
   * An observation (text and/or files, CM-0019 §9) while pending, by the
   * inspector or anyone with Update. `fileIds` are the poster's uploads to
   * the request (not yet on an entry), attached to the observation in the
   * same transaction; with files the text may be empty.
   */
  async addObservation(
    access: MemberAccess,
    inspectionId: string,
    input: { body?: string | null; fileIds?: readonly string[] },
  ): Promise<string> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, inspectionId);
    const viewer = await this.viewer(access);
    if (!inspectionActions(viewer, current, false).observe) {
      assertPending(current.status, "observe");
      throw forbidden(
        "PERMISSION_DENIED",
        "Only the inspector or a member with Update can add observations.",
      );
    }
    const fileIds = [...new Set(input.fileIds ?? [])];
    const body = observationBody(input.body, fileIds.length > 0);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [inspectionId]);
      if (locked == null) throw inspectionNotFound();
      assertPending(locked.status, "observe");
      await store.insertObservation(tx, {
        id,
        workspaceId: access.workspaceId,
        inspectionId,
        body,
        createdAt: at,
        createdBy: access.userId,
      });
      await this.deps.files.attach(tx, {
        workspaceId: access.workspaceId,
        inspectionId,
        observationId: id,
        fileIds,
        by: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inspection.observation_added",
        entityType: "inspection",
        entityId: inspectionId,
        after: { observationId: id, body, fileIds },
        occurredAt: at,
      });
    });
    return id;
  }

  /** The author deletes their own observation while the request is pending. */
  async deleteObservation(
    access: MemberAccess,
    inspectionId: string,
    observationId: string,
  ): Promise<{ projectId: string; at: Date }> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, inspectionId);
    const at = this.clock();
    const removed = await db.$transaction(async (tx) => {
      const [locked] = await store.lock(tx, access.workspaceId, [inspectionId]);
      if (locked == null) throw inspectionNotFound();
      const observation = await store.findObservation(
        tx,
        access.workspaceId,
        inspectionId,
        observationId,
      );
      if (observation == null) throw observationNotFound();
      if (observation.createdBy !== access.userId)
        throw forbidden(
          "PERMISSION_DENIED",
          "Only the person who wrote an observation can delete it.",
        );
      assertPending(locked.status, "observe");
      await store.tombstoneObservation(tx, observationId, access.userId, at);
      const files = await this.deps.files.tombstone(tx, {
        workspaceId: access.workspaceId,
        inspectionId,
        observationId,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inspection.observation_deleted",
        entityType: "inspection",
        entityId: inspectionId,
        before: {
          observationId,
          body: observation.body,
          fileIds: files.map((file) => file.id),
        },
        occurredAt: at,
      });
      return files;
    });
    await this.removeFromGallery(trackingFilesMediaRemoved(removed, at));
    return { projectId: current.projectId, at };
  }

  /** A remark: text, any time, by anyone who can read the request. */
  async addRemark(
    access: MemberAccess,
    inspectionId: string,
    raw: string,
  ): Promise<string> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, inspectionId);
    assertCan(access, MENU, "read", { projectId: current.projectId });
    const body = remarkBody(raw);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.insertRemark(tx, {
        id,
        workspaceId: access.workspaceId,
        inspectionId,
        body,
        createdAt: at,
        createdBy: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inspection.remark_added",
        entityType: "inspection",
        entityId: inspectionId,
        after: { remarkId: id, body },
        occurredAt: at,
      });
    });
    return id;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredInspection> {
    const row = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (row == null) throw inspectionNotFound();
    return row;
  }

  /** Read models with names, drawing links, re-inspections and snags. */
  async readModels(
    workspaceId: string,
    rows: readonly StoredInspection[],
  ): Promise<InspectionReadModel[]> {
    const { directory, store, db, drawingLinks } = this.deps;
    const memberIds = new Set<string>();
    const userIds = new Set<string>();
    const departmentIds = new Set<string>();
    const contractorIds = new Set<string>();
    const drawingIds = new Set<string>();
    const originalIds = new Set<string>();
    for (const row of rows) {
      if (row.inspectorMemberId != null) memberIds.add(row.inspectorMemberId);
      if (row.departmentId != null) departmentIds.add(row.departmentId);
      if (row.contractorId != null) contractorIds.add(row.contractorId);
      if (row.reinspectionOfId != null) originalIds.add(row.reinspectionOfId);
      userIds.add(row.createdBy);
      if (row.decidedBy != null) userIds.add(row.decidedBy);
      for (const id of row.drawingIds) drawingIds.add(id);
    }
    const ids = rows.map((row) => row.id);
    const [names, links, originals, reinspections, snags] = await Promise.all([
      directory.names(db, workspaceId, {
        memberIds: [...memberIds],
        userIds: [...userIds],
        departmentIds: [...departmentIds],
        contractorIds: [...contractorIds],
        drawingIds: [...drawingIds],
      }),
      drawingLinks(db, workspaceId, [...drawingIds]),
      store.refs(db, workspaceId, [...originalIds]),
      store.reinspections(db, workspaceId, ids),
      store.snags(db, workspaceId, ids),
    ]);
    const name = (map: ReadonlyMap<string, string>, id: string | null) =>
      id == null ? null : (map.get(id) ?? null);
    return rows.map((row) => ({
      ...row,
      departmentName: name(names.departments, row.departmentId),
      contractorName: name(names.contractors, row.contractorId),
      inspectorName: name(names.members, row.inspectorMemberId),
      drawings: row.drawingIds.map((id) => {
        const link = links.get(id);
        return {
          id,
          name: link?.name ?? names.drawings.get(id) ?? null,
          albumId: link?.albumId ?? null,
          albumName: link?.albumName ?? null,
          revision: link?.revision ?? null,
        };
      }),
      reinspectionOf:
        row.reinspectionOfId == null
          ? null
          : (originals.get(row.reinspectionOfId) ?? null),
      reinspections: reinspections.get(row.id) ?? [],
      snags: snags.get(row.id) ?? [],
      createdByName: name(names.users, row.createdBy),
      decidedByName: name(names.users, row.decidedBy),
    }));
  }

  async get(workspaceId: string, id: string): Promise<InspectionReadModel> {
    const row = await this.find(workspaceId, id);
    const [model] = await this.readModels(workspaceId, [row]);
    if (model == null) throw inspectionNotFound();
    return model;
  }

  async list(params: InspectionListParams) {
    const page = await this.deps.store.list(this.deps.db, params);
    return {
      ...page,
      items: await this.readModels(params.workspaceId, page.items),
    };
  }

  async observations(
    viewer: InspectionViewer,
    inspection: StoredInspection,
  ): Promise<ObservationReadModel[]> {
    const { store, db, directory } = this.deps;
    const workspaceId = viewer.access.workspaceId;
    const rows = await store.observations(db, workspaceId, inspection.id);
    const [names, files] = await Promise.all([
      directory.names(db, workspaceId, {
        userIds: [...new Set(rows.map((row) => row.createdBy))],
      }),
      this.deps.files.ofObservations(db, {
        workspaceId,
        inspectionId: inspection.id,
        observationIds: rows.map((row) => row.id),
      }),
    ]);
    return rows.map((row) => ({
      ...row,
      createdByName: names.users.get(row.createdBy) ?? null,
      files: files.get(row.id) ?? [],
      canDelete:
        inspection.status === "pending" &&
        row.createdBy === viewer.access.userId,
    }));
  }

  async remarks(
    workspaceId: string,
    inspectionId: string,
  ): Promise<RemarkReadModel[]> {
    const { store, db, directory } = this.deps;
    const rows = await store.remarks(db, workspaceId, inspectionId);
    const names = await directory.names(db, workspaceId, {
      userIds: [...new Set(rows.map((row) => row.createdBy))],
    });
    return rows.map((row) => ({
      ...row,
      createdByName: names.users.get(row.createdBy) ?? null,
    }));
  }

  /**
   * **Raise re-inspection** prefill (CM-0019 §10): what the new request
   * copies from a rejected one, keeping only what can still be picked —
   * an inspector still active on the Project, an enabled Department, a
   * Contractor still assigned, live drawings, a location still on the
   * Project. Needs Create; 409 when the request is not rejected or is
   * already being inspected again.
   */
  async reinspection(
    access: MemberAccess,
    id: string,
  ): Promise<ReinspectionDraft> {
    const { db, store, directory, locations } = this.deps;
    const original = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "create", { projectId: original.projectId });
    assertReinspectable(original, original.projectId);
    const existing = (await store.reinspections(db, access.workspaceId, [id]))
      .get(id)
      ?.at(0);
    if (existing != null) throw reinspectionExists(existing);
    const draft = reinspectionDraft(original);
    const refs = await directory.references(
      db,
      access.workspaceId,
      original.projectId,
      {
        memberIds:
          draft.inspectorMemberId == null ? [] : [draft.inspectorMemberId],
        departmentIds: draft.departmentId == null ? [] : [draft.departmentId],
        contractorIds: draft.contractorId == null ? [] : [draft.contractorId],
        drawingIds: draft.drawingIds,
      },
    );
    const inspector =
      draft.inspectorMemberId == null
        ? undefined
        : refs.members.get(draft.inspectorMemberId);
    const department =
      draft.departmentId == null
        ? undefined
        : refs.departments.get(draft.departmentId);
    const contractor =
      draft.contractorId == null
        ? undefined
        : refs.contractors.get(draft.contractorId);
    let siteLocation = draft.siteLocation;
    if (siteLocation != null) {
      try {
        await locations.assertOnProject(
          access.workspaceId,
          original.projectId,
          siteLocation,
        );
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        siteLocation = null;
      }
    }
    return {
      ...draft,
      inspectorMemberId:
        inspector?.active === true && inspector.onProject ? inspector.id : null,
      departmentId:
        department != null && !department.disabled ? department.id : null,
      contractorId:
        contractor?.isActive === true && contractor.onProject
          ? contractor.id
          : null,
      drawingIds: draft.drawingIds.filter(
        (drawingId) => refs.drawings.get(drawingId)?.onProject === true,
      ),
      siteLocation,
    };
  }

  /** Inspectors, Departments, Contractors and Drawings the form offers. */
  async formOptions(
    workspaceId: string,
    projectId: string,
  ): Promise<InspectionFormOptions> {
    const options = await this.deps.directory.options(
      this.deps.db,
      workspaceId,
      projectId,
      ["members", "departments", "contractors", "drawings"],
    );
    return {
      members: options.members,
      departments: options.departments,
      contractors: options.contractors,
      drawings: options.drawings,
    };
  }
}
