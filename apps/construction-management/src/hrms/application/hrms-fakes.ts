import { PermissionSet, type MemberAccess } from "@/src/shared-kernel/access";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { conflict } from "@/src/shared-kernel/domain-error";

import {
  DEFAULT_HRMS_SETTINGS,
  type HrmsSettings,
} from "../domain/hrms-settings";
import type {
  HrmsSettingsStore,
  StoredHrmsSettings,
} from "./hrms-settings-handlers";
import type { HrmsSettingsReader } from "./ports";

/** A Team Member's access for handler tests; the Owner when `grants` is omitted. */
export function accessFor(
  grants?: PermissionGrants,
  workspaceId = "company-1",
  userId = "user-1",
): MemberAccess {
  return {
    workspaceId,
    userId,
    role: grants == null ? "owner" : "member",
    permissions:
      grants == null
        ? PermissionSet.everything()
        : PermissionSet.fromGrants(grants),
    projectIds: new Set(),
  };
}

/** HRMS Settings in memory, as store and reader (no Prisma). */
export class FakeHrmsSettingsStore
  implements HrmsSettingsStore, HrmsSettingsReader
{
  readonly rows = new Map<
    string,
    { settings: HrmsSettings; updatedAt: Date }
  >();
  readonly audits: {
    workspaceId: string;
    before: HrmsSettings;
    after: HrmsSettings;
    by: string;
  }[] = [];

  find(workspaceId: string): Promise<StoredHrmsSettings> {
    const row = this.rows.get(workspaceId);
    return Promise.resolve(
      row == null
        ? { settings: DEFAULT_HRMS_SETTINGS, updatedAt: null }
        : { settings: row.settings, updatedAt: row.updatedAt },
    );
  }

  async settingsFor(workspaceId: string): Promise<HrmsSettings> {
    return (await this.find(workspaceId)).settings;
  }

  save(input: {
    workspaceId: string;
    settings: HrmsSettings;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void> {
    const row = this.rows.get(input.workspaceId);
    if (
      (row?.updatedAt.getTime() ?? null) !==
      (input.expectedUpdatedAt?.getTime() ?? null)
    )
      return Promise.reject(
        conflict(
          "HRMS_SETTINGS_CHANGED",
          "Someone else changed these settings.",
        ),
      );
    this.rows.set(input.workspaceId, {
      settings: input.settings,
      updatedAt: input.now,
    });
    this.audits.push({
      workspaceId: input.workspaceId,
      before: row?.settings ?? DEFAULT_HRMS_SETTINGS,
      after: input.settings,
      by: input.by,
    });
    return Promise.resolve();
  }
}
