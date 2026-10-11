import type { Prisma } from "@repo/construction-db";

import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";
import {
  DEFAULT_WORKSHEET_SETTINGS,
  worksheetSettings,
  type WorksheetSettings,
} from "../domain/worksheet";

type Db = Prisma.TransactionClient;

const MENU = SITE_WORK_DOCUMENTS.worksheet.menu;

/** A Project's saved worksheet settings; null `updatedAt` = the defaults. */
export type StoredWorksheetSettings = WorksheetSettings & {
  updatedAt: Date | null;
  updatedBy: string | null;
};

export type WorksheetSettingsStore = {
  find(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredWorksheetSettings | null>;
  /** Locks the Project's row `FOR UPDATE` when it exists, and reads it. */
  lock(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredWorksheetSettings | null>;
  save(
    db: Db,
    row: WorksheetSettings & {
      workspaceId: string;
      projectId: string;
      by: string;
      at: Date;
    },
  ): Promise<void>;
};

export type WorksheetSettingsDeps = {
  db: Db & { $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
  store: WorksheetSettingsStore;
  /** Whether the Project is the Company's and live. */
  projectExists: (workspaceId: string, projectId: string) => Promise<boolean>;
  clock?: () => Date;
};

export function defaultWorksheetSettings(): StoredWorksheetSettings {
  return {
    ...DEFAULT_WORKSHEET_SETTINGS,
    sectionOrder: [...DEFAULT_WORKSHEET_SETTINGS.sectionOrder],
    updatedAt: null,
    updatedBy: null,
  };
}

/**
 * The Project's worksheet settings (CM-0016 §2): section toggles, section
 * order and approval. Reading needs Daily Worksheet read (the routes);
 * saving needs Update on the Project. They apply to sheets saved from then
 * on and never change saved sheets.
 */
export class WorksheetSettingsHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: WorksheetSettingsDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async get(
    workspaceId: string,
    projectId: string,
    db: Db = this.deps.db,
  ): Promise<StoredWorksheetSettings> {
    return (
      (await this.deps.store.find(db, workspaceId, projectId)) ??
      defaultWorksheetSettings()
    );
  }

  /**
   * Saves the settings. `expectedUpdatedAt` is the `updatedAt` last read
   * (null for the defaults); a stale one is 409
   * `WORKSHEET_SETTINGS_CHANGED`.
   */
  async save(
    access: MemberAccess,
    projectId: string,
    input: Omit<WorksheetSettings, "sectionOrder"> & {
      sectionOrder: readonly string[];
    },
    expectedUpdatedAt?: Date | null,
  ): Promise<void> {
    assertCan(access, MENU, "update", { projectId });
    const settings = worksheetSettings(input);
    if (!(await this.deps.projectExists(access.workspaceId, projectId)))
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.deps.store.lock(
        tx,
        access.workspaceId,
        projectId,
      );
      const seen = current?.updatedAt?.getTime() ?? null;
      if (
        expectedUpdatedAt !== undefined &&
        (expectedUpdatedAt?.getTime() ?? null) !== seen
      )
        throw conflict(
          "WORKSHEET_SETTINGS_CHANGED",
          "Someone changed these settings. Reload them and try again.",
          { updatedAt: current?.updatedAt?.toISOString() ?? null },
        );
      await this.deps.store.save(tx, {
        ...settings,
        workspaceId: access.workspaceId,
        projectId,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "worksheet_settings.updated",
        entityType: "worksheet_settings",
        entityId: projectId,
        before: current == null ? null : withoutBookkeeping(current),
        after: settings,
        occurredAt: at,
      });
    });
  }
}

function withoutBookkeeping(
  settings: StoredWorksheetSettings,
): WorksheetSettings {
  const { updatedAt: _at, updatedBy: _by, ...rest } = settings;
  return rest;
}
