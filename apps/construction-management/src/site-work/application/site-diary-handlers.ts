import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { BackdatedModuleKey } from "@/src/shared-kernel/backdated-policy";
import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import {
  siteDiaryContent,
  type SiteDiaryContent,
  type SiteDiaryInput,
  type Weather,
} from "../domain/site-diary";
import { siteWorkDocumentMediaRemoved } from "../domain/document-thread";
import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";
import type { SiteRecordDirectory, SiteWorkTx } from "./ports";
import { removeFromGallery } from "./gallery-index";

const DOCUMENT = SITE_WORK_DOCUMENTS.site_diary;
const MENU = DOCUMENT.menu;

/** Checks one entry date against the Back-dated Entry policy (CM-113). */
export type SiteRecordBackdatedCheck = (
  module: BackdatedModuleKey,
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export const siteDiaryNotFound = () =>
  notFound("SITE_DIARY_NOT_FOUND", "This Site Diary was not found.");

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/prisma-site-diary-store`)
// ---------------------------------------------------------------------------

export type StoredSiteDiary = SiteDiaryContent & {
  id: string;
  workspaceId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** One dated diary in a month list. */
export type SiteDiaryDay = {
  id: string;
  diaryDate: CalendarDate;
  weatherMorning: Weather | null;
  weatherAfternoon: Weather | null;
  rainfallMm: string | null;
  visitorCount: number;
  instructionCount: number;
};

export type SiteDiaryStore = {
  find(
    db: SiteWorkTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredSiteDiary | null>;
  findByDate(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredSiteDiary | null>;
  /** Locks the live row `FOR UPDATE` and reads it. */
  lock(
    db: SiteWorkTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredSiteDiary | null>;
  /** Throws 409 `SITE_DIARY_EXISTS` when a live diary has the date. */
  insert(
    db: SiteWorkTx,
    row: SiteDiaryContent & {
      id: string;
      workspaceId: string;
      projectId: string;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /** Writes the fields and replaces the visitor and instruction rows. */
  replace(
    db: SiteWorkTx,
    id: string,
    content: SiteDiaryContent & { by: string; at: Date },
  ): Promise<void>;
  tombstone(db: SiteWorkTx, id: string, by: string, at: Date): Promise<void>;
  /** Live diaries dated `from`–`to`, newest first. */
  days(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<SiteDiaryDay[]>;
};

export type SiteDiaryDeps = {
  db: SiteWorkTx & {
    $transaction<T>(fn: (tx: SiteWorkTx) => Promise<T>): Promise<T>;
  };
  store: SiteDiaryStore;
  directory: SiteRecordDirectory;
  backdated: (actor: MemberAccess) => Promise<SiteRecordBackdatedCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `ProjectMediaRemoved` for the document's Gallery tiles on delete (ADR CM-0014). */
  media: EventDispatcher;
  clock?: () => Date;
};

export type SiteDiaryActions = {
  edit: boolean;
  delete: boolean;
  print: boolean;
};

export type SiteDiaryDetail = StoredSiteDiary & {
  createdByName: string | null;
  updatedByName: string | null;
};

/** What the viewer may do with a diary (screens hide the rest). */
export function siteDiaryActions(
  access: MemberAccess,
  diary: { projectId: string },
): SiteDiaryActions {
  const scope = { projectId: diary.projectId };
  return {
    edit: can(access, MENU, "update", scope),
    delete: can(access, MENU, "delete", scope),
    print: can(access, MENU, "print", scope),
  };
}

/** The longest range one month list reads. */
export const SITE_DIARY_DAYS_MAX = 366;

function snapshot(diary: SiteDiaryContent) {
  return {
    diaryDate: diary.diaryDate,
    weatherMorning: diary.weatherMorning,
    weatherAfternoon: diary.weatherAfternoon,
    rainfallMm: diary.rainfallMm,
    siteCondition: diary.siteCondition,
    notes: diary.notes,
    visitors: diary.visitors,
    instructions: diary.instructions,
  };
}

function changed(diary: StoredSiteDiary, expectedUpdatedAt: Date) {
  if (diary.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    throw conflict(
      "SITE_DIARY_CHANGED",
      "Someone changed this Site Diary. Reload it and try again.",
      { updatedAt: diary.updatedAt.toISOString() },
    );
}

/**
 * Site Diary commands and queries (CM-607, ADR CM-0016 §13). One diary per
 * Project per date. Every write is one transaction: the row lock, the
 * back-dated check, the rows and the audit event. Permissions are checked
 * here as well as in the routes.
 */
export class SiteDiaryHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: SiteDiaryDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async create(
    access: MemberAccess,
    input: SiteDiaryInput & { projectId: string },
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
    const content = siteDiaryContent(
      input,
      await this.deps.today(access.workspaceId),
    );
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      check(DOCUMENT.backdated, "create", content.diaryDate);
      await store.insert(tx, {
        ...content,
        id,
        workspaceId: access.workspaceId,
        projectId: input.projectId,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "site_diary.created",
        entityType: "site_diary",
        entityId: id,
        after: snapshot(content),
        occurredAt: at,
      });
    });
    return id;
  }

  async edit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: SiteDiaryInput,
  ): Promise<void> {
    const { db, store } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const content = siteDiaryContent(
      input,
      await this.deps.today(access.workspaceId),
    );
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw siteDiaryNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.diaryDate);
      if (content.diaryDate !== locked.diaryDate) {
        check(DOCUMENT.backdated, "edit", content.diaryDate);
        const other = await store.findByDate(
          tx,
          access.workspaceId,
          locked.projectId,
          content.diaryDate,
        );
        if (other != null) throw siteDiaryExists(content.diaryDate);
      }
      await store.replace(tx, id, { ...content, by: access.userId, at });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "site_diary.updated",
        entityType: "site_diary",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(content),
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
      if (locked == null) throw siteDiaryNotFound();
      changed(locked, expectedUpdatedAt);
      check(DOCUMENT.backdated, "edit", locked.diaryDate);
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "site_diary.deleted",
        entityType: "site_diary",
        entityId: id,
        before: snapshot(locked),
        occurredAt: at,
      });
    });
    await removeFromGallery(
      this.deps.media,
      siteWorkDocumentMediaRemoved({
        workspaceId: access.workspaceId,
        projectId: current.projectId,
        type: "site_diary",
        documentId: id,
        at,
      }),
    );
  }

  async find(workspaceId: string, id: string): Promise<StoredSiteDiary> {
    const diary = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (diary == null) throw siteDiaryNotFound();
    return diary;
  }

  private async detail(diary: StoredSiteDiary): Promise<SiteDiaryDetail> {
    const names = await this.deps.directory.userNames(diary.workspaceId, [
      diary.createdBy,
      diary.updatedBy,
    ]);
    return {
      ...diary,
      createdByName: names.get(diary.createdBy) ?? null,
      updatedByName: names.get(diary.updatedBy) ?? null,
    };
  }

  async get(workspaceId: string, id: string): Promise<SiteDiaryDetail> {
    return this.detail(await this.find(workspaceId, id));
  }

  /** The Project's diary for a date, or null. */
  async onDate(
    workspaceId: string,
    projectId: string,
    date: string,
  ): Promise<SiteDiaryDetail | null> {
    const day = assertCalendarDate(date, "SITE_DIARY_DATE_INVALID");
    const diary = await this.deps.store.findByDate(
      this.deps.db,
      workspaceId,
      projectId,
      day,
    );
    return diary == null ? null : this.detail(diary);
  }

  /** The dates with a diary in `from`–`to` (at most a year), newest first. */
  async days(
    workspaceId: string,
    projectId: string,
    from: string,
    to: string,
  ): Promise<SiteDiaryDay[]> {
    const start = assertCalendarDate(from, "SITE_DIARY_DATE_INVALID");
    const end = assertCalendarDate(to, "SITE_DIARY_DATE_INVALID");
    const span = daysBetween(start, end);
    if (span < 0 || span >= SITE_DIARY_DAYS_MAX)
      throw new DomainError(
        "SITE_DIARY_RANGE_INVALID",
        "Choose a range of at most a year, ending on or after its start.",
        { details: { field: "to" } },
      );
    return this.deps.store.days(
      this.deps.db,
      workspaceId,
      projectId,
      start,
      end,
    );
  }
}

export function siteDiaryExists(date: CalendarDate): DomainError {
  return conflict(
    "SITE_DIARY_EXISTS",
    "This Project already has a Site Diary for that date. Open it and edit it instead.",
    { field: "diaryDate", diaryDate: date },
  );
}
