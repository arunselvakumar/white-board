import type { Prisma } from "@repo/construction-db";

import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import {
  DEFAULT_EQUIPMENT_SHEET_SETTINGS,
  type EquipmentSheetSettings,
} from "../domain/equipment-usage";
import { SITE_WORK_DOCUMENTS } from "../domain/site-work-documents";

type Db = Prisma.TransactionClient;

const MENU = SITE_WORK_DOCUMENTS.equipment_usage.menu;

/** A Project's saved equipment-sheet settings; null `updatedAt` = the defaults. */
export type StoredEquipmentSheetSettings = EquipmentSheetSettings & {
  updatedAt: Date | null;
  updatedBy: string | null;
};

export type EquipmentSheetSettingsStore = {
  find(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredEquipmentSheetSettings | null>;
  /** Locks the Project's row `FOR UPDATE` when it exists, and reads it. */
  lock(
    db: Db,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredEquipmentSheetSettings | null>;
  save(
    db: Db,
    row: EquipmentSheetSettings & {
      workspaceId: string;
      projectId: string;
      by: string;
      at: Date;
    },
  ): Promise<void>;
};

export type EquipmentSheetSettingsDeps = {
  db: Db & { $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> };
  store: EquipmentSheetSettingsStore;
  /** Whether the Project is the Company's and live. */
  projectExists: (workspaceId: string, projectId: string) => Promise<boolean>;
  clock?: () => Date;
};

export function defaultEquipmentSheetSettings(): StoredEquipmentSheetSettings {
  return {
    ...DEFAULT_EQUIPMENT_SHEET_SETTINGS,
    updatedAt: null,
    updatedBy: null,
  };
}

/**
 * The Project's equipment-sheet settings (CM-0016 §2): field toggles and
 * approval. Reading needs Equipment Usage read (the routes); saving needs
 * Update on the Project. They apply to sheets saved from then on.
 */
export class EquipmentSheetSettingsHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: EquipmentSheetSettingsDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async get(
    workspaceId: string,
    projectId: string,
    db: Db = this.deps.db,
  ): Promise<StoredEquipmentSheetSettings> {
    return (
      (await this.deps.store.find(db, workspaceId, projectId)) ??
      defaultEquipmentSheetSettings()
    );
  }

  /**
   * Saves the settings. `expectedUpdatedAt` is the `updatedAt` last read
   * (null for the defaults); a stale one is 409
   * `EQUIPMENT_SHEET_SETTINGS_CHANGED`.
   */
  async save(
    access: MemberAccess,
    projectId: string,
    settings: EquipmentSheetSettings,
    expectedUpdatedAt?: Date | null,
  ): Promise<void> {
    assertCan(access, MENU, "update", { projectId });
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
          "EQUIPMENT_SHEET_SETTINGS_CHANGED",
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
        action: "equipment_sheet_settings.updated",
        entityType: "equipment_sheet_settings",
        entityId: projectId,
        before: current == null ? null : withoutBookkeeping(current),
        after: settings,
        occurredAt: at,
      });
    });
  }
}

function withoutBookkeeping(
  settings: StoredEquipmentSheetSettings,
): EquipmentSheetSettings {
  const { updatedAt: _at, updatedBy: _by, ...rest } = settings;
  return rest;
}
