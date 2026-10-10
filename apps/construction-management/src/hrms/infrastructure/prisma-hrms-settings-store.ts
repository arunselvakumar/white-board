import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  HrmsSettingsStore,
  StoredHrmsSettings,
} from "../application/hrms-settings-handlers";
import type { HrmsSettingsReader } from "../application/ports";
import type { IsoWeekday } from "../domain/calendar";
import {
  DEFAULT_HRMS_SETTINGS,
  type HrmsSettings,
} from "../domain/hrms-settings";

type SettingsRow = Prisma.ConstructionHrmsSettingsGetPayload<object>;

function settingsChanged() {
  return conflict(
    "HRMS_SETTINGS_CHANGED",
    "Someone else changed these settings after you opened them. Reload to see their changes.",
  );
}

/** A stored row as settings. The CHECK constraint holds every rule, so no re-validation. */
export function hrmsSettingsFromRow(row: SettingsRow): HrmsSettings {
  return Object.freeze({
    gpsRequirement: row.gpsRequirement,
    graceMinutes: row.graceMinutes,
    workingHoursPerDay: row.workingHoursPerDay.toNumber(),
    halfDayHours: row.halfDayHours.toNumber(),
    workingDays: Object.freeze(
      [...row.workingDays].sort((a, b) => a - b) as IsoWeekday[],
    ),
    leaveApprovalLevels: row.leaveApprovalLevels === 2 ? 2 : 1,
    leaveYear: row.leaveYear,
    carryForwardEnabled: row.carryForwardEnabled,
    carryForwardMaxDays: row.carryForwardMaxDays?.toNumber() ?? null,
    leaveAccrualEnabled: row.leaveAccrualEnabled,
    autoSalaryCalculation: row.autoSalaryCalculation,
    salaryCalculationDay: row.salaryCalculationDay,
    ptStateCode: row.ptStateCode,
  });
}

function columns(settings: HrmsSettings) {
  return {
    gpsRequirement: settings.gpsRequirement,
    graceMinutes: settings.graceMinutes,
    workingHoursPerDay: settings.workingHoursPerDay.toFixed(2),
    halfDayHours: settings.halfDayHours.toFixed(2),
    workingDays: [...settings.workingDays],
    leaveApprovalLevels: settings.leaveApprovalLevels,
    leaveYear: settings.leaveYear,
    carryForwardEnabled: settings.carryForwardEnabled,
    carryForwardMaxDays: settings.carryForwardMaxDays?.toFixed(2) ?? null,
    leaveAccrualEnabled: settings.leaveAccrualEnabled,
    autoSalaryCalculation: settings.autoSalaryCalculation,
    salaryCalculationDay: settings.salaryCalculationDay,
    ptStateCode: settings.ptStateCode,
  };
}

/**
 * `construction_hrms.settings`, one row per Company written on the first
 * save (CM-303). Also the `HrmsSettingsReader` the rest of the context uses.
 */
export class PrismaHrmsSettingsStore
  implements HrmsSettingsStore, HrmsSettingsReader
{
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string): Promise<StoredHrmsSettings> {
    const row = await this.db.constructionHrmsSettings.findUnique({
      where: { workspaceId },
    });
    if (row == null)
      return { settings: DEFAULT_HRMS_SETTINGS, updatedAt: null };
    return { settings: hrmsSettingsFromRow(row), updatedAt: row.updatedAt };
  }

  async settingsFor(workspaceId: string): Promise<HrmsSettings> {
    return (await this.find(workspaceId)).settings;
  }

  async save(input: {
    workspaceId: string;
    settings: HrmsSettings;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void> {
    const data = columns(input.settings);
    try {
      await this.db.$transaction(async (tx) => {
        // Lock the row so two saves cannot both pass the check below.
        await tx.$queryRaw`
          SELECT id FROM construction_hrms.settings
          WHERE workspace_id = ${input.workspaceId}
          FOR UPDATE
        `;
        const row = await tx.constructionHrmsSettings.findUnique({
          where: { workspaceId: input.workspaceId },
        });
        if (
          (row?.updatedAt.getTime() ?? null) !==
          (input.expectedUpdatedAt?.getTime() ?? null)
        )
          throw settingsChanged();
        await tx.constructionHrmsSettings.upsert({
          where: { workspaceId: input.workspaceId },
          create: {
            id: newId(input.now.getTime()),
            workspaceId: input.workspaceId,
            ...data,
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
          update: { ...data, updatedAt: input.now, updatedBy: input.by },
        });
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_settings.updated",
          entityType: "hrms_settings",
          entityId: input.workspaceId,
          before:
            row == null ? DEFAULT_HRMS_SETTINGS : hrmsSettingsFromRow(row),
          after: input.settings,
          occurredAt: input.now,
        });
      });
    } catch (error) {
      // Two first saves racing: the loser hits the unique workspace index.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw settingsChanged();
      throw error;
    }
  }
}
