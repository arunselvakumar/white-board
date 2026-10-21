import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  canTransitionInquiry,
  followUpDue,
  inquiryBookingActive,
  inquiryChanged,
  inquiryDuplicate,
  inquiryFields,
  inquiryHasBooking,
  inquiryNotFound,
  inquiryNotOpen,
  inquiryTransition,
  lostRemarks,
  OPEN_CLOSING,
  type InquiryClosing,
  type InquiryInput,
} from "../domain/inquiry";
import type { InquiryAssigned } from "../domain/inquiry-events";
import { salesProjectNotFound } from "../domain/sales-errors";
import type {
  FollowUpDue,
  InquiryEventType,
  InquiryStatus,
  InterestType,
} from "../domain/sales-terms";
import {
  dueBounds,
  fromStoredFollowUpAt,
  toStoredFollowUpAt,
  type DueBounds,
  type SalesDateTime,
} from "../domain/sales-time";
import {
  assertPickedLeadSource,
  assertPickedStage,
  lockPickedLists,
} from "./picked-lists";
import type { SalesDirectory, SalesMemberFacts, SalesTx } from "./ports";
import {
  importInquiries,
  inquiryImportLists,
  type InquiryImportLists,
  type InquirySheetRow,
} from "./inquiry-import";
import type { SalesListStore } from "./sales-settings-handlers";

const MENU = "sales.inquiries";

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/inquiry-store`)
// ---------------------------------------------------------------------------

/** What a save writes besides the status and bookkeeping columns. */
export type InquiryContent = {
  inquiryDate: CalendarDate;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  interestType: InterestType | null;
  interestedWingId: string | null;
  interestedUnitType: string | null;
  leadSourceId: string | null;
  funnelStageId: string | null;
  nextFollowUpAt: Date | null;
  nextFollowUpHasTime: boolean;
  assigneeMemberId: string | null;
  leadOwnerMemberId: string | null;
  remarks: string | null;
};

export type StoredInquiry = InquiryContent & {
  id: string;
  workspaceId: string;
  projectId: string;
  status: InquiryStatus;
  convertedUnitId: string | null;
  convertedBookingId: string | null;
  lostReasonId: string | null;
  lostRemarks: string | null;
  closedAt: Date | null;
  /** User ids. */
  closedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** A history row (`inquiry_events`). */
export type StoredInquiryEvent = {
  id: string;
  type: InquiryEventType;
  details: Record<string, unknown> | null;
  occurredAt: Date;
  actorUserId: string;
};

export type NewInquiryEvent = {
  inquiryId: string;
  type: InquiryEventType;
  details?: Record<string, unknown> | null;
};

/**
 * Without View all a member sees only the inquiries they created (a User
 * id) or are the Assignee or Lead Owner of (Team Member ids). Null: every
 * inquiry of the Project (CM-0022 §3).
 */
export type InquiryVisibility = {
  userId: string;
  memberId: string | null;
} | null;

export type InquiryListParams = {
  workspaceId: string;
  projectId: string;
  visibility: InquiryVisibility;
  /** For the Due filter: now and the Company's today. */
  bounds: DueBounds;
  statuses?: readonly InquiryStatus[];
  funnelStageId?: string;
  interestTypes?: readonly InterestType[];
  leadSourceId?: string;
  assigneeMemberId?: string;
  /** Open inquiries by their next follow-up (CM-0022 §4). */
  due?: FollowUpDue;
  /** Part of the name, mobile or email. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

/** A live inquiry with the same mobile or email. */
export type InquiryMatch = {
  id: string;
  name: string;
  status: InquiryStatus;
  createdBy: string;
  assigneeMemberId: string | null;
  leadOwnerMemberId: string | null;
};

export type InquiryStore = {
  find(
    db: SalesTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredInquiry | null>;
  /** Locks the live row `FOR UPDATE` and reads it. */
  lock(
    db: SalesTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredInquiry | null>;
  insert(
    db: SalesTx,
    row: InquiryContent & {
      id: string;
      workspaceId: string;
      projectId: string;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /** Many new inquiries in one statement (the import, CM-1007). */
  insertMany(
    db: SalesTx,
    rows: readonly Parameters<InquiryStore["insert"]>[1][],
  ): Promise<void>;
  replace(
    db: SalesTx,
    id: string,
    content: InquiryContent & { by: string; at: Date },
  ): Promise<void>;
  tombstone(db: SalesTx, id: string, by: string, at: Date): Promise<void>;
  appendEvents(
    db: SalesTx,
    workspaceId: string,
    events: readonly NewInquiryEvent[],
    by: string,
    at: Date,
  ): Promise<void>;
  /** Oldest first. */
  events(
    db: SalesTx,
    workspaceId: string,
    inquiryId: string,
  ): Promise<StoredInquiryEvent[]>;
  /** Newest first. */
  list(
    db: SalesTx,
    params: InquiryListParams,
  ): Promise<{ items: StoredInquiry[]; hasMore: boolean; total: number }>;
  /** Live inquiries of the Project with this mobile or email (any case). */
  duplicates(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    keys: { mobile: string | null; email: string | null },
    exceptId: string | null,
  ): Promise<InquiryMatch[]>;
  /**
   * A follow-up's effect (CM-1004): the inquiry's stage and next follow-up
   * (null clears it), stamped as an update.
   */
  setProgress(
    db: SalesTx,
    id: string,
    change: {
      funnelStageId: string | null;
      nextFollowUpAt: Date | null;
      nextFollowUpHasTime: boolean;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /**
   * Closing or reopening (CM-1007): the status, its closing fields and the
   * stage (kept while closed; a reopened inquiry whose stage was deleted
   * goes to the first stage).
   */
  setClosing(
    db: SalesTx,
    id: string,
    change: InquiryClosing & {
      funnelStageId: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /**
   * The normalised mobiles and lowercase emails among these that live
   * inquiries of the Project have (the import's duplicate check).
   */
  existingKeys(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    mobiles: readonly string[],
    emails: readonly string[],
  ): Promise<{ mobiles: Set<string>; emails: Set<string> }>;
  /** Whether this booking is live and On Hold or Booked. */
  bookingActive(
    db: SalesTx,
    workspaceId: string,
    bookingId: string,
  ): Promise<boolean>;
};

/** Checks one date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type InquiryBackdatedCheck = (
  module: "inquiry" | "inquiry_follow_up" | "booking",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type InquiryDeps = {
  db: SalesTx & {
    $transaction<T>(fn: (tx: SalesTx) => Promise<T>): Promise<T>;
  };
  store: InquiryStore;
  lists: SalesListStore;
  directory: SalesDirectory;
  backdated: (access: MemberAccess) => Promise<InquiryBackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  timeZone: (workspaceId: string) => Promise<string>;
  /** `InquiryAssigned` and the import's `ImportedInquiriesAssigned`, to messaging (CM-0022 §10). */
  events: EventDispatcher;
  /** Books a unit inside the convert transaction (the bookings' `bookUnitInTx`). */
  bookings: InquiryBookingPort;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

/** Edit: a field left out keeps the stored value; `null` clears it. */
export type InquiryWriteInput = InquiryInput & {
  interestedWingId?: string | null;
  leadSourceId?: string | null;
  /** Create: the first stage when left out. Edit: left out or null keeps it. */
  funnelStageId?: string | null;
  /** Create: the creator (when on the Project) when left out. Edit: left out keeps it. */
  assigneeMemberId?: string | null;
  leadOwnerMemberId?: string | null;
};

/**
 * What closing as Converted needs from bookings (CM-1007): a Booked
 * booking for the unit made in the caller's transaction, with every unit
 * rule (404 `UNIT_NOT_FOUND`, 409 `UNIT_UNAVAILABLE`, `UNIT_BOOKED`);
 * `afterCommit` runs once the transaction has committed.
 */
export type InquiryBookingPort = {
  bookUnit(
    tx: SalesTx,
    input: {
      workspaceId: string;
      projectId: string;
      unitId: string;
      bookingDate: CalendarDate;
      customer: {
        name: string;
        mobile: string | null;
        email: string | null;
        address: string | null;
      };
      inquiryId: string;
      by: string;
      now: Date;
    },
  ): Promise<{ bookingId: string; afterCommit: () => Promise<void> }>;
};

export type InquiryActions = {
  /** Inquiry Update. */
  edit: boolean;
  /** Inquiry Delete. */
  delete: boolean;
  /** Add a follow-up: Update, while Open (CM-1004). */
  followUp: boolean;
  /** Add, edit and tick Inquiry Tasks: Update (CM-1004). */
  manageTasks: boolean;
  /** Close as Lost: Update, while Open (CM-1007). */
  close: boolean;
  /** Close as Converted: Update and Booking Create, while Open. */
  convert: boolean;
  /** Reopen: Update, while Converted or Lost. */
  reopen: boolean;
};

type Named = { id: string; name: string | null };
type Person = { userId: string; name: string | null };

export type InquiryReadModel = StoredInquiry & {
  nextFollowUp: SalesDateTime | null;
  /** Overdue / Today / Upcoming / None for an Open inquiry; null once closed. */
  due: FollowUpDue | null;
  funnelStage: Named | null;
  leadSource: Named | null;
  interestedWing: Named | null;
  assignee: Named | null;
  leadOwner: Named | null;
  lostReason: Named | null;
  /** While Converted: its unit, as "A Wing 101". */
  convertedUnit: Named | null;
  createdByPerson: Person;
};

export type InquiryHistoryItem = StoredInquiryEvent & {
  by: Person;
  /** Names of the members and stages the details name. */
  names: Record<string, string | null>;
};

export type InquiryFormOptions = {
  members: SalesMemberFacts[];
  wings: { id: string; name: string }[];
  funnelStages: { id: string; name: string }[];
  leadSources: { id: string; name: string }[];
  lostReasons: { id: string; name: string }[];
  /** The viewer's Team Member when on the Project (the form's default people). */
  viewerMemberId: string | null;
};

/** What the viewer may do with an inquiry (screens hide the rest). */
export function inquiryActions(
  access: MemberAccess,
  inquiry: { projectId: string; status: InquiryStatus },
): InquiryActions {
  const scope = { projectId: inquiry.projectId };
  const update = can(access, MENU, "update", scope);
  return {
    edit: update,
    delete: can(access, MENU, "delete", scope),
    followUp: update && inquiry.status === "open",
    manageTasks: update,
    close: update && canTransitionInquiry(inquiry.status, "lose"),
    convert:
      update &&
      can(access, "sales.bookings", "create", scope) &&
      canTransitionInquiry(inquiry.status, "convert"),
    reopen: update && canTransitionInquiry(inquiry.status, "reopen"),
  };
}

/** Whether a member without View all sees this inquiry. */
export function isInquiryVisible(
  inquiry: {
    createdBy: string;
    assigneeMemberId: string | null;
    leadOwnerMemberId: string | null;
  },
  visibility: InquiryVisibility,
): boolean {
  if (visibility == null) return true;
  if (inquiry.createdBy === visibility.userId) return true;
  return (
    visibility.memberId != null &&
    (inquiry.assigneeMemberId === visibility.memberId ||
      inquiry.leadOwnerMemberId === visibility.memberId)
  );
}

function snapshot(content: InquiryContent) {
  return {
    inquiryDate: content.inquiryDate,
    name: content.name,
    mobile: content.mobile,
    email: content.email,
    address: content.address,
    occupation: content.occupation,
    interestType: content.interestType,
    interestedWingId: content.interestedWingId,
    interestedUnitType: content.interestedUnitType,
    leadSourceId: content.leadSourceId,
    funnelStageId: content.funnelStageId,
    nextFollowUpAt: content.nextFollowUpAt?.toISOString() ?? null,
    nextFollowUpHasTime: content.nextFollowUpHasTime,
    assigneeMemberId: content.assigneeMemberId,
    leadOwnerMemberId: content.leadOwnerMemberId,
    remarks: content.remarks,
  };
}

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim() ?? "";
  return text === "" ? null : text.toLowerCase();
};

/**
 * Inquiries (CM-1003, ADR CM-0022 §3): create (the full form and quick add
 * are one command), edit, delete, list and read, scoped by View all. Every
 * write is one transaction with the row lock, the back-dated check on the
 * Inquiry Date, the history rows and the audit event; `InquiryAssigned`
 * is dispatched after commit. Lead Source, Funnel Stage, Wing, Assignee
 * and Lead Owner are checked when set or changed, so an old inquiry stays
 * editable after its Lead Source is disabled.
 */
export class InquiryHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: InquiryDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Who the viewer may see on the Project (View all, or theirs). */
  async visibility(
    access: MemberAccess,
    projectId: string,
  ): Promise<InquiryVisibility> {
    if (can(access, MENU, "view_all", { projectId })) return null;
    const member = await this.deps.directory.memberOfUser(
      this.deps.db,
      access.workspaceId,
      access.userId,
      projectId,
    );
    return { userId: access.userId, memberId: member?.id ?? null };
  }

  /** The Company's today and now, for the Due filter and words. */
  async bounds(workspaceId: string): Promise<DueBounds> {
    const [today, timeZone] = await Promise.all([
      this.deps.today(workspaceId),
      this.deps.timeZone(workspaceId),
    ]);
    return dueBounds(this.clock(), today, timeZone);
  }

  private async person(
    access: MemberAccess,
    projectId: string,
    memberId: string | null | undefined,
    current: string | null | undefined,
    role: "assignee" | "leadOwner",
  ): Promise<string | null> {
    if (memberId === undefined) {
      if (current !== undefined) return current;
      // A new inquiry: the creator, when on the Project.
      const viewer = await this.deps.directory.memberOfUser(
        this.deps.db,
        access.workspaceId,
        access.userId,
        projectId,
      );
      return viewer != null && viewer.onProject && viewer.active
        ? viewer.id
        : null;
    }
    const id = clean(memberId);
    if (id == null || id === current) return id;
    const found = (
      await this.deps.directory.members(
        this.deps.db,
        access.workspaceId,
        projectId,
        [id],
      )
    ).get(id);
    const field =
      role === "assignee" ? "assigneeMemberId" : "leadOwnerMemberId";
    if (found == null)
      throw refused(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
        field,
      );
    if (!found.onProject || !found.active)
      throw refused(
        role === "assignee"
          ? "ASSIGNEE_NOT_ON_PROJECT"
          : "LEAD_OWNER_NOT_ON_PROJECT",
        `Choose an active Team Member on this Project as the ${role === "assignee" ? "Assignee" : "Lead Owner"}.`,
        field,
      );
    return id;
  }

  private async content(
    access: MemberAccess,
    projectId: string,
    input: InquiryWriteInput,
    current: StoredInquiry | null,
  ): Promise<InquiryContent> {
    const { db, directory, lists } = this.deps;
    const ws = access.workspaceId;
    const [today, timeZone] = await Promise.all([
      this.deps.today(ws),
      this.deps.timeZone(ws),
    ]);
    // An edit that leaves the Inquiry Date out keeps the stored one, like
    // the Stage, Assignee and Lead Owner (review of #93).
    const fields = inquiryFields(
      { ...input, inquiryDate: input.inquiryDate ?? current?.inquiryDate },
      today,
    );
    const project = await directory.project(db, ws, projectId);
    if (project == null) throw salesProjectNotFound();
    // An edit keeps every field it leaves out; `null` clears it (the
    // Project edit rule, review of #93).
    const keep = <T>(
      key: keyof InquiryWriteInput,
      value: T,
      stored: (row: StoredInquiry) => T,
    ): T =>
      current != null && input[key] === undefined ? stored(current) : value;

    const wingId = keep(
      "interestedWingId",
      clean(input.interestedWingId),
      (row) => row.interestedWingId,
    );
    if (wingId != null && wingId !== current?.interestedWingId) {
      const wing = (await directory.wingsById(db, ws, projectId, [wingId])).get(
        wingId,
      );
      if (wing == null || wing.deleted)
        throw refused(
          "WING_NOT_FOUND",
          "Choose a Wing of this Project.",
          "interestedWingId",
        );
    }

    const leadSourceId = keep(
      "leadSourceId",
      clean(input.leadSourceId),
      (row) => row.leadSourceId,
    );
    if (leadSourceId != null && leadSourceId !== current?.leadSourceId) {
      const source = (
        await lists.byIds(db, ws, "lead_source", [leadSourceId])
      ).get(leadSourceId);
      assertPickedLeadSource(source, projectId);
    }

    let funnelStageId = clean(input.funnelStageId);
    if (funnelStageId == null) {
      funnelStageId =
        current != null
          ? current.funnelStageId
          : ((await lists.list(db, ws, projectId, "funnel_stage"))[0]?.id ??
            null);
    } else if (funnelStageId !== current?.funnelStageId) {
      if (current != null && current.status !== "open")
        throw inquiryNotOpen(current.status);
      const stage = (
        await lists.byIds(db, ws, "funnel_stage", [funnelStageId])
      ).get(funnelStageId);
      assertPickedStage(stage, projectId, "funnelStageId");
    }

    const next = keep(
      "nextFollowUp",
      toStoredFollowUpAt(fields.nextFollowUp, timeZone),
      (row) =>
        row.nextFollowUpAt == null
          ? null
          : { at: row.nextFollowUpAt, hasTime: row.nextFollowUpHasTime },
    );
    return {
      inquiryDate: fields.inquiryDate,
      name: fields.name,
      mobile: keep("mobile", fields.mobile, (row) => row.mobile),
      email: keep("email", fields.email, (row) => row.email),
      address: keep("address", fields.address, (row) => row.address),
      occupation: keep(
        "occupation",
        fields.occupation,
        (row) => row.occupation,
      ),
      interestType: keep(
        "interestType",
        fields.interestType,
        (row) => row.interestType,
      ),
      interestedWingId: wingId,
      interestedUnitType: keep(
        "interestedUnitType",
        fields.interestedUnitType,
        (row) => row.interestedUnitType,
      ),
      leadSourceId,
      funnelStageId,
      nextFollowUpAt: next?.at ?? null,
      nextFollowUpHasTime: next?.hasTime ?? false,
      assigneeMemberId: await this.person(
        access,
        projectId,
        input.assigneeMemberId,
        current?.assigneeMemberId,
        "assignee",
      ),
      leadOwnerMemberId: await this.person(
        access,
        projectId,
        input.leadOwnerMemberId,
        current?.leadOwnerMemberId,
        "leadOwner",
      ),
      remarks: keep("remarks", fields.remarks, (row) => row.remarks),
    };
  }

  /**
   * 409 `INQUIRY_DUPLICATE` when another live inquiry of the Project has
   * the mobile or email (CM-0022 §3), unless `allowDuplicate`. Matches the
   * viewer may not see are listed without their name.
   */
  private async assertNoDuplicate(
    tx: SalesTx,
    access: MemberAccess,
    projectId: string,
    keys: { mobile: string | null; email: string | null },
    exceptId: string | null,
  ): Promise<void> {
    if (keys.mobile == null && keys.email == null) return;
    const matches = await this.deps.store.duplicates(
      tx,
      access.workspaceId,
      projectId,
      keys,
      exceptId,
    );
    if (matches.length === 0) return;
    const visibility = await this.visibility(access, projectId);
    throw inquiryDuplicate(
      matches.map((match) => ({
        id: match.id,
        name: isInquiryVisible(match, visibility) ? match.name : null,
        status: match.status,
      })),
    );
  }

  private assigned(
    inquiry: { id: string; workspaceId: string; projectId: string },
    name: string,
    assigneeMemberId: string,
    by: string,
    at: Date,
  ): InquiryAssigned {
    return {
      type: "InquiryAssigned",
      workspaceId: inquiry.workspaceId,
      occurredAt: at,
      inquiryId: inquiry.id,
      projectId: inquiry.projectId,
      name,
      assigneeMemberId,
      by,
    };
  }

  private async dispatch(events: readonly InquiryAssigned[]): Promise<void> {
    if (events.length > 0) await this.deps.events.dispatch(events);
  }

  /**
   * Adds an inquiry (the full form or quick add): Open at the first Funnel
   * Stage unless another is picked; Assignee and Lead Owner default to the
   * creator when on the Project. The back-dated `inquiry` window applies
   * to the Inquiry Date.
   */
  async create(
    access: MemberAccess,
    input: InquiryWriteInput & { projectId: string; allowDuplicate?: boolean },
  ): Promise<string> {
    assertCan(access, MENU, "create", { projectId: input.projectId });
    const content = await this.content(access, input.projectId, input, null);
    const check = await this.deps.backdated(access);
    check("inquiry", "create", content.inquiryDate);
    const id = newId();
    const at = this.clock();
    const ws = access.workspaceId;
    await this.deps.db.$transaction(async (tx) => {
      await lockPickedLists(this.deps.lists, tx, ws, input.projectId, {
        funnelStageId: content.funnelStageId,
        leadSourceId: content.leadSourceId,
        stageField: "funnelStageId",
      });
      if (input.allowDuplicate !== true)
        await this.assertNoDuplicate(
          tx,
          access,
          input.projectId,
          content,
          null,
        );
      await this.deps.store.insert(tx, {
        ...content,
        id,
        workspaceId: ws,
        projectId: input.projectId,
        by: access.userId,
        at,
      });
      await this.deps.store.appendEvents(
        tx,
        ws,
        [
          {
            inquiryId: id,
            type: "created",
            details: {
              stageId: content.funnelStageId,
              assigneeMemberId: content.assigneeMemberId,
              leadOwnerMemberId: content.leadOwnerMemberId,
            },
          },
        ],
        access.userId,
        at,
      );
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "inquiry.created",
        entityType: "inquiry",
        entityId: id,
        after: {
          projectId: input.projectId,
          ...snapshot(content),
          ...(input.allowDuplicate === true ? { allowDuplicate: true } : {}),
        },
        occurredAt: at,
      });
    });
    if (content.assigneeMemberId != null)
      await this.dispatch([
        this.assigned(
          { id, workspaceId: ws, projectId: input.projectId },
          content.name,
          content.assigneeMemberId,
          access.userId,
          at,
        ),
      ]);
    return id;
  }

  /**
   * Edits an inquiry (Update), any status; the stage moves only while it
   * is Open. A field left out keeps what is stored; `null` clears it. 409 `INQUIRY_CHANGED` when `expectedUpdatedAt` is stale; the
   * duplicate check runs when the mobile or email changes. History rows
   * record a new Assignee, Lead Owner or stage.
   */
  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: InquiryWriteInput & { allowDuplicate?: boolean },
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.visible(access, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const content = await this.content(
      access,
      current.projectId,
      input,
      current,
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    const ws = access.workspaceId;
    const before = await db.$transaction(async (tx) => {
      const row = await store.lock(tx, ws, id);
      if (row == null) throw inquiryNotFound();
      if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw inquiryChanged(row.updatedAt);
      check("inquiry", "edit", row.inquiryDate);
      if (content.inquiryDate !== row.inquiryDate)
        check("inquiry", "edit", content.inquiryDate);
      await lockPickedLists(this.deps.lists, tx, ws, row.projectId, {
        funnelStageId:
          content.funnelStageId === row.funnelStageId
            ? null
            : content.funnelStageId,
        leadSourceId:
          content.leadSourceId === row.leadSourceId
            ? null
            : content.leadSourceId,
        stageField: "funnelStageId",
      });
      const keysChanged =
        content.mobile !== row.mobile ||
        clean(content.email) !== clean(row.email);
      if (keysChanged && input.allowDuplicate !== true)
        await this.assertNoDuplicate(
          tx,
          access,
          row.projectId,
          {
            mobile: content.mobile === row.mobile ? null : content.mobile,
            email:
              clean(content.email) === clean(row.email) ? null : content.email,
          },
          id,
        );
      await store.replace(tx, id, { ...content, by: access.userId, at });
      const history: NewInquiryEvent[] = [];
      if (content.assigneeMemberId !== row.assigneeMemberId)
        history.push({
          inquiryId: id,
          type: "assigned",
          details: {
            fromMemberId: row.assigneeMemberId,
            toMemberId: content.assigneeMemberId,
          },
        });
      if (content.leadOwnerMemberId !== row.leadOwnerMemberId)
        history.push({
          inquiryId: id,
          type: "lead_owner_changed",
          details: {
            fromMemberId: row.leadOwnerMemberId,
            toMemberId: content.leadOwnerMemberId,
          },
        });
      if (content.funnelStageId !== row.funnelStageId)
        history.push({
          inquiryId: id,
          type: "stage_moved",
          details: {
            fromStageId: row.funnelStageId,
            toStageId: content.funnelStageId,
          },
        });
      await store.appendEvents(tx, ws, history, access.userId, at);
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "inquiry.updated",
        entityType: "inquiry",
        entityId: id,
        before: snapshot(row),
        after: snapshot(content),
        occurredAt: at,
      });
      return row;
    });
    if (
      content.assigneeMemberId != null &&
      content.assigneeMemberId !== before.assigneeMemberId
    )
      await this.dispatch([
        this.assigned(
          before,
          content.name,
          content.assigneeMemberId,
          access.userId,
          at,
        ),
      ]);
  }

  /**
   * Deletes an inquiry (a tombstone; Inquiry Delete). The back-dated edit
   * window applies to its Inquiry Date. 409 `INQUIRY_HAS_BOOKING` for a
   * Converted inquiry whose booking is still On Hold or Booked.
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
      const row = await store.lock(tx, access.workspaceId, id);
      if (row == null) throw inquiryNotFound();
      if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw inquiryChanged(row.updatedAt);
      if (
        row.status === "converted" &&
        row.convertedBookingId != null &&
        (await store.bookingActive(
          tx,
          access.workspaceId,
          row.convertedBookingId,
        ))
      )
        throw inquiryHasBooking(row.convertedBookingId);
      check("inquiry", "edit", row.inquiryDate);
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inquiry.deleted",
        entityType: "inquiry",
        entityId: id,
        before: { status: row.status, ...snapshot(row) },
        occurredAt: at,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Import (CM-1007, ADR CM-0022 §9)
  // -------------------------------------------------------------------------

  /** Adds the sheet's rows as inquiries, all or none (`importInquiries`). */
  importSheet(
    access: MemberAccess,
    projectId: string,
    rows: readonly InquirySheetRow[],
    allowDuplicates: boolean,
  ): Promise<{ imported: number }> {
    return importInquiries(this.deps, access, projectId, rows, {
      allowDuplicates,
      now: this.clock(),
    });
  }

  /** The live names the import sample lists (Inquiry Create). */
  importLists(
    access: MemberAccess,
    projectId: string,
  ): Promise<InquiryImportLists> {
    return inquiryImportLists(this.deps, access, projectId);
  }

  // -------------------------------------------------------------------------
  // Close and reopen (CM-1007, ADR CM-0022 §6)
  // -------------------------------------------------------------------------

  /**
   * Closes an Open inquiry as **Converted** (Inquiry Update and Booking
   * Create): in one transaction a Booked booking for the unit, carrying
   * the inquiry's name, mobile, email and address and linked to it, and
   * the inquiry's closing fields and `converted` history row. The booking
   * date (today unless given) is inside the back-dated `booking` window.
   * The unit rules are the bookings' (404 `UNIT_NOT_FOUND`, 409
   * `UNIT_UNAVAILABLE`, `UNIT_BOOKED`). Returns the booking's id.
   */
  async convert(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: { unitId: string; bookingDate?: CalendarDate | null },
  ): Promise<string> {
    const current = await this.visible(access, id);
    const scope = { projectId: current.projectId };
    assertCan(access, MENU, "update", scope);
    assertCan(access, "sales.bookings", "create", scope);
    inquiryTransition(current.status, "convert");
    const ws = access.workspaceId;
    const bookingDate = input.bookingDate ?? (await this.deps.today(ws));
    const check = await this.deps.backdated(access);
    check("booking", "create", bookingDate);
    const at = this.clock();
    const { bookingId, afterCommit } = await this.deps.db.$transaction(
      async (tx) => {
        const row = await this.lockUnchanged(tx, ws, id, expectedUpdatedAt);
        inquiryTransition(row.status, "convert");
        const booked = await this.deps.bookings.bookUnit(tx, {
          workspaceId: ws,
          projectId: row.projectId,
          unitId: input.unitId,
          bookingDate,
          customer: {
            name: row.name,
            mobile: row.mobile,
            email: row.email,
            address: row.address,
          },
          inquiryId: id,
          by: access.userId,
          now: at,
        });
        const closing: InquiryClosing = {
          ...OPEN_CLOSING,
          status: "converted",
          convertedUnitId: input.unitId,
          convertedBookingId: booked.bookingId,
          closedAt: at,
          closedBy: access.userId,
        };
        await this.close(tx, access, row, closing, at, {
          unitId: input.unitId,
          bookingId: booked.bookingId,
          bookingDate,
        });
        return booked;
      },
    );
    await afterCommit();
    return bookingId;
  }

  /** Closes an Open inquiry as **Lost** with a live Lost Reason and optional remarks. */
  async lose(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: { lostReasonId: string; remarks?: string | null },
  ): Promise<void> {
    const current = await this.visible(access, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    inquiryTransition(current.status, "lose");
    const remarks = lostRemarks(input.remarks);
    const ws = access.workspaceId;
    const reason = (
      await this.deps.lists.byIds(this.deps.db, ws, "lost_reason", [
        input.lostReasonId,
      ])
    ).get(input.lostReasonId);
    if (
      reason == null ||
      reason.deletedAt != null ||
      reason.projectId !== current.projectId
    )
      throw refused(
        "LOST_REASON_NOT_FOUND",
        "This Lost Reason was not found.",
        "lostReasonId",
      );
    if (!reason.isActive)
      throw refused(
        "LOST_REASON_DISABLED",
        "This Lost Reason is disabled. Choose another.",
        "lostReasonId",
      );
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const row = await this.lockUnchanged(tx, ws, id, expectedUpdatedAt);
      inquiryTransition(row.status, "lose");
      await this.close(
        tx,
        access,
        row,
        {
          ...OPEN_CLOSING,
          status: "lost",
          lostReasonId: reason.id,
          lostRemarks: remarks,
          closedAt: at,
          closedBy: access.userId,
        },
        at,
        { lostReasonId: reason.id, remarks },
      );
    });
  }

  /**
   * Reopens a Converted or Lost inquiry (Inquiry Update) at the stage it
   * had (the first stage when that one was deleted), clearing its closing
   * fields. A Converted inquiry reopens only once its booking is cancelled
   * or deleted (409 `INQUIRY_BOOKING_ACTIVE`); reopening never releases a
   * unit by itself.
   */
  async reopen(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const current = await this.visible(access, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    inquiryTransition(current.status, "reopen");
    const ws = access.workspaceId;
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const row = await this.lockUnchanged(tx, ws, id, expectedUpdatedAt);
      inquiryTransition(row.status, "reopen");
      if (
        row.convertedBookingId != null &&
        (await this.deps.store.bookingActive(tx, ws, row.convertedBookingId))
      )
        throw inquiryBookingActive(row.convertedBookingId);
      const stages = await this.deps.lists.list(
        tx,
        ws,
        row.projectId,
        "funnel_stage",
      );
      const stageId = stages.some((stage) => stage.id === row.funnelStageId)
        ? row.funnelStageId
        : (stages[0]?.id ?? null);
      await this.close(
        tx,
        access,
        row,
        OPEN_CLOSING,
        at,
        {
          from: row.status,
          stageId,
          bookingId: row.convertedBookingId,
        },
        stageId,
      );
    });
  }

  private async lockUnchanged(
    tx: SalesTx,
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<StoredInquiry> {
    const row = await this.deps.store.lock(tx, workspaceId, id);
    if (row == null) throw inquiryNotFound();
    if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw inquiryChanged(row.updatedAt);
    return row;
  }

  /** Writes a closing (or reopening), its history row and its audit event. */
  private async close(
    tx: SalesTx,
    access: MemberAccess,
    row: StoredInquiry,
    closing: InquiryClosing,
    at: Date,
    details: Record<string, unknown>,
    funnelStageId: string | null = row.funnelStageId,
  ): Promise<void> {
    const type =
      closing.status === "converted"
        ? "converted"
        : closing.status === "lost"
          ? "lost"
          : "reopened";
    await this.deps.store.setClosing(tx, row.id, {
      ...closing,
      funnelStageId,
      by: access.userId,
      at,
    });
    await this.deps.store.appendEvents(
      tx,
      access.workspaceId,
      [{ inquiryId: row.id, type, details }],
      access.userId,
      at,
    );
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: `inquiry.${type}`,
      entityType: "inquiry",
      entityId: row.id,
      before: { status: row.status },
      after: { status: closing.status, ...details },
      occurredAt: at,
    });
  }

  /** "A Wing 101" for units of the Project, removed ones included. */
  private async unitLabels(
    workspaceId: string,
    projectId: string,
    unitIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (unitIds.length === 0) return new Map();
    const { db, directory } = this.deps;
    const units = await directory.units(db, workspaceId, projectId, unitIds);
    const wings = await directory.wingsById(db, workspaceId, projectId, [
      ...new Set([...units.values()].map((unit) => unit.wingId)),
    ]);
    return new Map(
      [...units.values()].map((unit) => [
        unit.id,
        `${wings.get(unit.wingId)?.name ?? "A removed Wing"} ${unit.name}`,
      ]),
    );
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** A live inquiry of the Company (404 otherwise), visibility not checked. */
  async find(workspaceId: string, id: string): Promise<StoredInquiry> {
    const inquiry = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (inquiry == null) throw inquiryNotFound();
    return inquiry;
  }

  /** A live inquiry the viewer may see; 404 for one they may not. */
  async visible(access: MemberAccess, id: string): Promise<StoredInquiry> {
    const inquiry = await this.find(access.workspaceId, id);
    if (
      !isInquiryVisible(
        inquiry,
        await this.visibility(access, inquiry.projectId),
      )
    )
      throw inquiryNotFound();
    return inquiry;
  }

  async readModels(
    workspaceId: string,
    rows: readonly StoredInquiry[],
  ): Promise<InquiryReadModel[]> {
    if (rows.length === 0) return [];
    const { db, directory, lists } = this.deps;
    const ids = (pick: (row: StoredInquiry) => string | null) => [
      ...new Set(
        rows.flatMap((row) => {
          const id = pick(row);
          return id == null ? [] : [id];
        }),
      ),
    ];
    const projectIds = ids((row) => row.projectId);
    const projectId = projectIds[0] ?? "";
    const [bounds, timeZone, stages, sources, reasons, members, wings, users] =
      await Promise.all([
        this.bounds(workspaceId),
        this.deps.timeZone(workspaceId),
        lists.byIds(
          db,
          workspaceId,
          "funnel_stage",
          ids((r) => r.funnelStageId),
        ),
        lists.byIds(
          db,
          workspaceId,
          "lead_source",
          ids((r) => r.leadSourceId),
        ),
        lists.byIds(
          db,
          workspaceId,
          "lost_reason",
          ids((r) => r.lostReasonId),
        ),
        directory.members(db, workspaceId, projectId, [
          ...ids((r) => r.assigneeMemberId),
          ...ids((r) => r.leadOwnerMemberId),
        ]),
        directory.wingsById(
          db,
          workspaceId,
          projectId,
          ids((r) => r.interestedWingId),
        ),
        directory.userNames(
          db,
          workspaceId,
          ids((r) => r.createdBy),
        ),
      ]);
    const units = await this.unitLabels(
      workspaceId,
      projectId,
      ids((r) => r.convertedUnitId),
    );
    const named = (
      id: string | null,
      map: ReadonlyMap<string, { name: string }>,
    ): Named | null =>
      id == null ? null : { id, name: map.get(id)?.name ?? null };
    return rows.map((row) => {
      const next =
        row.nextFollowUpAt == null
          ? null
          : { at: row.nextFollowUpAt, hasTime: row.nextFollowUpHasTime };
      return {
        ...row,
        nextFollowUp: fromStoredFollowUpAt(
          { at: row.nextFollowUpAt, hasTime: row.nextFollowUpHasTime },
          timeZone,
        ),
        due: followUpDue(row.status, next, bounds),
        funnelStage: named(row.funnelStageId, stages),
        leadSource: named(row.leadSourceId, sources),
        lostReason: named(row.lostReasonId, reasons),
        convertedUnit:
          row.convertedUnitId == null
            ? null
            : {
                id: row.convertedUnitId,
                name: units.get(row.convertedUnitId) ?? null,
              },
        interestedWing: named(row.interestedWingId, wings),
        assignee: named(row.assigneeMemberId, members),
        leadOwner: named(row.leadOwnerMemberId, members),
        createdByPerson: {
          userId: row.createdBy,
          name: users.get(row.createdBy) ?? null,
        },
      };
    });
  }

  /** One inquiry the viewer may see, with names and its history. */
  async get(
    access: MemberAccess,
    id: string,
  ): Promise<InquiryReadModel & { history: InquiryHistoryItem[] }> {
    const inquiry = await this.visible(access, id);
    const [[model], history] = await Promise.all([
      this.readModels(access.workspaceId, [inquiry]),
      this.history(access.workspaceId, inquiry.projectId, id),
    ]);
    if (model == null) throw inquiryNotFound();
    return { ...model, history };
  }

  /** The history rows, oldest first, with the names they mention. */
  async history(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<InquiryHistoryItem[]> {
    const { db, store, directory, lists } = this.deps;
    const rows = await store.events(db, workspaceId, id);
    const strings = (keys: readonly string[]) => [
      ...new Set(
        rows.flatMap((row) =>
          keys
            .map((key) => row.details?.[key])
            .filter((value): value is string => typeof value === "string"),
        ),
      ),
    ];
    const memberKeys = [
      "fromMemberId",
      "toMemberId",
      "assigneeMemberId",
      "leadOwnerMemberId",
    ];
    const stageKeys = ["fromStageId", "toStageId", "stageId"];
    const [members, stages, users, units, reasons] = await Promise.all([
      directory.members(db, workspaceId, projectId, strings(memberKeys)),
      lists.byIds(db, workspaceId, "funnel_stage", strings(stageKeys)),
      directory.userNames(
        db,
        workspaceId,
        rows.map((row) => row.actorUserId),
      ),
      this.unitLabels(workspaceId, projectId, strings(["unitId"])),
      lists.byIds(db, workspaceId, "lost_reason", strings(["lostReasonId"])),
    ]);
    return rows.map((row) => {
      const names: Record<string, string | null> = {};
      const unitId = row.details?.["unitId"];
      if (typeof unitId === "string")
        names["unitId"] = units.get(unitId) ?? null;
      const reasonId = row.details?.["lostReasonId"];
      if (typeof reasonId === "string")
        names["lostReasonId"] = reasons.get(reasonId)?.name ?? null;
      for (const key of [...memberKeys, ...stageKeys]) {
        const value = row.details?.[key];
        if (typeof value !== "string") continue;
        names[key] = memberKeys.includes(key)
          ? (members.get(value)?.name ?? null)
          : (stages.get(value)?.name ?? null);
      }
      return {
        ...row,
        names,
        by: {
          userId: row.actorUserId,
          name: users.get(row.actorUserId) ?? null,
        },
      };
    });
  }

  /** A page of the Project's inquiries the viewer may see, newest first. */
  async list(
    access: MemberAccess,
    params: Omit<InquiryListParams, "workspaceId" | "visibility" | "bounds">,
  ) {
    const page = await this.deps.store.list(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
      visibility: await this.visibility(access, params.projectId),
      bounds: await this.bounds(access.workspaceId),
    });
    return {
      ...page,
      items: await this.readModels(access.workspaceId, page.items),
    };
  }

  /**
   * The form's and filters' pickers: active Team Members on the Project,
   * its live Wings, Funnel Stages in order, and the enabled Lead Sources
   * and Lost Reasons.
   */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<InquiryFormOptions> {
    const { db, directory, lists } = this.deps;
    const ws = access.workspaceId;
    await lists.ensureSeeded(ws, projectId);
    const [members, wings, stages, sources, reasons, viewer] =
      await Promise.all([
        directory.membersOnProject(db, ws, projectId),
        directory.wings(db, ws, projectId),
        lists.list(db, ws, projectId, "funnel_stage"),
        lists.list(db, ws, projectId, "lead_source"),
        lists.list(db, ws, projectId, "lost_reason"),
        directory.memberOfUser(db, ws, access.userId, projectId),
      ]);
    const pick = (rows: readonly { id: string; name: string }[]) =>
      rows.map(({ id, name }) => ({ id, name }));
    return {
      members,
      wings: pick(wings),
      funnelStages: pick(stages),
      leadSources: pick(sources.filter((row) => row.isActive)),
      lostReasons: pick(reasons.filter((row) => row.isActive)),
      viewerMemberId:
        viewer != null && viewer.onProject && viewer.active ? viewer.id : null,
    };
  }
}
