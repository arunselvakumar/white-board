import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import {
  locationRef,
  type LocationRef,
  type LocationRefInput,
  type LocationResolver,
} from "@/src/shared-kernel/location-ref";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import {
  closeHindrance,
  daysLost,
  hindranceFields,
  hindranceStatus,
  type HindranceCause,
  type HindranceFields,
  type HindranceInput,
  type HindranceStatus,
  type ResponsibleParty,
} from "../domain/hindrance";
import { siteWorkDocumentMediaRemoved } from "../domain/document-thread";
import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";
import type {
  SiteRecordContractor,
  SiteRecordDirectory,
  SiteRecordTeamMember,
  SiteWorkTx,
} from "./ports";
import type { SiteRecordBackdatedCheck } from "./site-diary-handlers";
import { removeFromGallery } from "./gallery-index";

const DOCUMENT = SITE_WORK_DOCUMENTS.hindrance;
const MENU = DOCUMENT.menu;
/** Every hindrance module has a numbering rule (`HR/26-27/00001`). */
const SEQUENCE = "hindrance" as const;

export const hindranceNotFound = () =>
  notFound("HINDRANCE_NOT_FOUND", "This Hindrance was not found.");

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-hindrance-store`)
// ---------------------------------------------------------------------------

/** What a save writes besides the number and the bookkeeping columns. */
export type HindranceContent = HindranceFields & {
  siteLocation: LocationRef | null;
  equipmentUsageSheetId: string | null;
};

export type StoredHindrance = HindranceContent & {
  id: string;
  workspaceId: string;
  projectId: string;
  number: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** The usage sheet a hindrance was raised from (CM-0016 §14). */
export type HindranceUsageSheet = {
  id: string;
  projectId: string;
  number: string;
  sheetDate: CalendarDate;
};

export type HindranceListParams = {
  workspaceId: string;
  projectId: string;
  status?: HindranceStatus;
  cause?: HindranceCause;
  responsibleParty?: ResponsibleParty;
  contractorId?: string;
  /** Overlapping this range: started on or before `to`, not ended before `from`. */
  from?: CalendarDate;
  to?: CalendarDate;
  /** Part of the number or the affected activity. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type HindranceStore = {
  find(
    db: SiteWorkTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredHindrance | null>;
  /** Locks the live row `FOR UPDATE` and reads it. */
  lock(
    db: SiteWorkTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredHindrance | null>;
  insert(
    db: SiteWorkTx,
    row: HindranceContent & {
      id: string;
      workspaceId: string;
      projectId: string;
      number: string;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  replace(
    db: SiteWorkTx,
    id: string,
    content: HindranceContent & { by: string; at: Date },
  ): Promise<void>;
  close(
    db: SiteWorkTx,
    id: string,
    values: {
      endDate: CalendarDate;
      hoursLost: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  tombstone(db: SiteWorkTx, id: string, by: string, at: Date): Promise<void>;
  /** Newest first (by when they were recorded). */
  list(
    db: SiteWorkTx,
    params: HindranceListParams,
  ): Promise<{ items: StoredHindrance[]; hasMore: boolean; total: number }>;
  /** Live hindrances on the register for `date`, oldest start first. */
  openOn(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredHindrance[]>;
  /** Live usage sheets by id. */
  usageSheets(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, HindranceUsageSheet>>;
};

export type HindranceDeps = {
  db: SiteWorkTx & {
    $transaction<T>(fn: (tx: SiteWorkTx) => Promise<T>): Promise<T>;
  };
  store: HindranceStore;
  directory: SiteRecordDirectory;
  locations: LocationResolver;
  backdated: (actor: MemberAccess) => Promise<SiteRecordBackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `ProjectMediaRemoved` for the document's Gallery tiles on delete (ADR CM-0014). */
  media: EventDispatcher;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type HindranceWriteInput = HindranceInput & {
  siteLocation?: LocationRefInput | null;
  equipmentUsageSheetId?: string | null;
};

export type HindranceActions = {
  edit: boolean;
  close: boolean;
  delete: boolean;
  print: boolean;
};

export type HindranceReadModel = StoredHindrance & {
  status: HindranceStatus;
  /** Calendar days, both ends counted; up to `asOf` while open. */
  daysLost: number;
  contractorName: string | null;
  signOffUserName: string | null;
  createdByName: string | null;
  equipmentUsageSheet: Omit<HindranceUsageSheet, "projectId"> | null;
};

export type HindranceFormOptions = {
  contractors: SiteRecordContractor[];
  teamMembers: SiteRecordTeamMember[];
};

/** What the viewer may do with a hindrance (screens hide the rest). */
export function hindranceActions(
  access: MemberAccess,
  hindrance: { projectId: string; endDate: CalendarDate | null },
): HindranceActions {
  const scope = { projectId: hindrance.projectId };
  const update = can(access, MENU, "update", scope);
  return {
    edit: update,
    close: update && hindrance.endDate == null,
    delete: can(access, MENU, "delete", scope),
    print: can(access, MENU, "print", scope),
  };
}

function snapshot(h: HindranceContent) {
  return {
    startDate: h.startDate,
    endDate: h.endDate,
    hoursLost: h.hoursLost,
    cause: h.cause,
    affectedActivity: h.affectedActivity,
    siteLocation: h.siteLocation,
    responsibleParty: h.responsibleParty,
    contractorId: h.contractorId,
    description: h.description,
    equipmentUsageSheetId: h.equipmentUsageSheetId,
    signOff: h.signOff,
  };
}

function changed(h: StoredHindrance, expectedUpdatedAt: Date) {
  if (h.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    throw conflict(
      "HINDRANCE_CHANGED",
      "Someone changed this Hindrance. Reload it and try again.",
      { updatedAt: h.updatedAt.toISOString() },
    );
}

/**
 * Hindrance register commands and queries (CM-607, ADR CM-0016 §14). Every
 * write is one transaction: the row lock, the back-dated check (on the
 * start date), the number and the audit event. The Contractor, the
 * sign-off Team Member and the usage sheet are checked against the
 * Project when they are set or changed, so an old record stays editable
 * after a Contractor leaves the Project.
 */
export class HindranceHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: HindranceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async content(
    access: MemberAccess,
    projectId: string,
    input: HindranceWriteInput,
    current: StoredHindrance | null,
  ): Promise<HindranceContent> {
    const { directory, locations, store, db } = this.deps;
    const workspaceId = access.workspaceId;
    const fields = hindranceFields(input, await this.deps.today(workspaceId));
    if (
      fields.contractorId != null &&
      fields.contractorId !== current?.contractorId
    ) {
      const contractors = await directory.projectContractors(
        workspaceId,
        projectId,
      );
      if (!contractors.some((c) => c.id === fields.contractorId))
        throw new DomainError(
          "CONTRACTOR_NOT_ON_PROJECT",
          "Choose a Contractor assigned to this Project.",
          { details: { field: "contractorId" } },
        );
    }
    const signOffUserId = fields.signOff?.userId ?? null;
    if (signOffUserId != null && signOffUserId !== current?.signOff?.userId) {
      const members = await directory.projectTeamMembers(
        workspaceId,
        projectId,
      );
      if (!members.some((m) => m.userId === signOffUserId))
        throw new DomainError(
          "SIGN_OFF_MEMBER_NOT_FOUND",
          "Choose a Team Member on this Project, or the Owner.",
          { details: { field: "signOff.userId" } },
        );
    }
    const sheetId = input.equipmentUsageSheetId?.trim() ?? "";
    const equipmentUsageSheetId = sheetId === "" ? null : sheetId;
    if (
      equipmentUsageSheetId != null &&
      equipmentUsageSheetId !== current?.equipmentUsageSheetId
    ) {
      const sheet = (
        await store.usageSheets(db, workspaceId, [equipmentUsageSheetId])
      ).get(equipmentUsageSheetId);
      if (sheet?.projectId !== projectId)
        throw new DomainError(
          "EQUIPMENT_USAGE_SHEET_NOT_FOUND",
          "This Equipment Usage sheet was not found on the Project.",
          { details: { field: "equipmentUsageSheetId" } },
        );
    }
    let siteLocation: LocationRef | null = null;
    if (input.siteLocation != null) {
      siteLocation = locationRef(input.siteLocation);
      await locations.assertOnProject(workspaceId, projectId, siteLocation);
    }
    return { ...fields, siteLocation, equipmentUsageSheetId };
  }

  async create(
    access: MemberAccess,
    input: HindranceWriteInput & { projectId: string },
  ): Promise<string> {
    assertCan(access, MENU, "create", { projectId: input.projectId });
    const { db, store, directory } = this.deps;
    if (!(await directory.projectExists(access.workspaceId, input.projectId)))
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
    const content = await this.content(access, input.projectId, input, null);
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      check(DOCUMENT.backdated, "create", content.startDate);
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: SEQUENCE,
        projectId: input.projectId,
        date: content.startDate,
        by: access.userId,
      });
      await store.insert(tx, {
        ...content,
        id,
        workspaceId: access.workspaceId,
        projectId: input.projectId,
        number,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "hindrance.created",
        entityType: "hindrance",
        entityId: id,
        after: { number, ...snapshot(content) },
        occurredAt: at,
      });
    });
    return id;
  }

  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: HindranceWriteInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const content = await this.content(
      access,
      current.projectId,
      input,
      current,
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw hindranceNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.startDate);
      if (content.startDate !== locked.startDate)
        check(DOCUMENT.backdated, "edit", content.startDate);
      await store.replace(tx, id, { ...content, by: access.userId, at });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "hindrance.updated",
        entityType: "hindrance",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(content),
        occurredAt: at,
      });
    });
  }

  /**
   * **Close**: the end date and, when given, the hours lost. Needs Update.
   * The back-dated edit limit applies to the end date, not the start, so a
   * long hindrance can still be closed.
   */
  async close(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: { endDate: string; hoursLost?: string | number | null },
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const today = await this.deps.today(access.workspaceId);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw hindranceNotFound();
      changed(locked, expectedUpdatedAt);
      const next = closeHindrance(locked, input, today);
      check(DOCUMENT.backdated, "edit", next.endDate);
      await store.close(tx, id, { ...next, by: access.userId, at });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "hindrance.closed",
        entityType: "hindrance",
        entityId: id,
        before: { endDate: locked.endDate, hoursLost: locked.hoursLost },
        after: next,
        occurredAt: at,
      });
    });
  }

  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "delete", { projectId: current.projectId });
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw hindranceNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.startDate);
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "hindrance.deleted",
        entityType: "hindrance",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
    });
    await removeFromGallery(
      this.deps.media,
      siteWorkDocumentMediaRemoved({
        workspaceId: access.workspaceId,
        projectId: current.projectId,
        type: "hindrance",
        documentId: id,
        at,
      }),
    );
  }

  async find(workspaceId: string, id: string): Promise<StoredHindrance> {
    const h = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (h == null) throw hindranceNotFound();
    return h;
  }

  /** Read models with names and days lost, counted up to `asOf`. */
  async readModels(
    workspaceId: string,
    rows: readonly StoredHindrance[],
    asOf: CalendarDate,
  ): Promise<HindranceReadModel[]> {
    const { directory, store, db } = this.deps;
    const contractorIds = new Set<string>();
    const userIds = new Set<string>();
    const sheetIds = new Set<string>();
    for (const row of rows) {
      if (row.contractorId != null) contractorIds.add(row.contractorId);
      if (row.signOff?.userId != null) userIds.add(row.signOff.userId);
      userIds.add(row.createdBy);
      if (row.equipmentUsageSheetId != null)
        sheetIds.add(row.equipmentUsageSheetId);
    }
    const [contractors, users, sheets] = await Promise.all([
      directory.contractorNames(workspaceId, [...contractorIds]),
      directory.userNames(workspaceId, [...userIds]),
      store.usageSheets(db, workspaceId, [...sheetIds]),
    ]);
    return rows.map((row) => {
      const sheet =
        row.equipmentUsageSheetId == null
          ? undefined
          : sheets.get(row.equipmentUsageSheetId);
      return {
        ...row,
        status: hindranceStatus(row.endDate),
        daysLost: daysLost(
          row.startDate,
          row.endDate,
          asOf < row.startDate ? row.startDate : asOf,
        ),
        contractorName:
          row.contractorId == null
            ? null
            : (contractors.get(row.contractorId) ?? null),
        signOffUserName:
          row.signOff?.userId == null
            ? null
            : (users.get(row.signOff.userId) ?? null),
        createdByName: users.get(row.createdBy) ?? null,
        equipmentUsageSheet:
          sheet == null
            ? null
            : {
                id: sheet.id,
                number: sheet.number,
                sheetDate: sheet.sheetDate,
              },
      };
    });
  }

  async get(workspaceId: string, id: string): Promise<HindranceReadModel> {
    const h = await this.find(workspaceId, id);
    const [model] = await this.readModels(
      workspaceId,
      [h],
      await this.deps.today(workspaceId),
    );
    if (model == null) throw hindranceNotFound();
    return model;
  }

  async list(params: HindranceListParams) {
    const page = await this.deps.store.list(this.deps.db, params);
    return {
      ...page,
      items: await this.readModels(
        params.workspaceId,
        page.items,
        await this.deps.today(params.workspaceId),
      ),
    };
  }

  /** The Contractors and sign-off Team Members the form offers. */
  async formOptions(
    workspaceId: string,
    projectId: string,
  ): Promise<HindranceFormOptions> {
    const [contractors, teamMembers] = await Promise.all([
      this.deps.directory.projectContractors(workspaceId, projectId),
      this.deps.directory.projectTeamMembers(workspaceId, projectId),
    ]);
    return { contractors, teamMembers };
  }
}
