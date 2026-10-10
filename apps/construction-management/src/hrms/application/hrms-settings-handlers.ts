import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";

import {
  createHrmsSettings,
  type HrmsSettings,
  type HrmsSettingsInput,
} from "../domain/hrms-settings";

export type StoredHrmsSettings = {
  settings: HrmsSettings;
  /** Null until the Company first saves its settings. */
  updatedAt: Date | null;
};

export type HrmsSettingsStore = {
  /** The Company's settings, or the defaults when none are saved. */
  find(workspaceId: string): Promise<StoredHrmsSettings>;
  /**
   * Upserts the row (the first save creates it) and appends the audit
   * event with the stored settings as `before`, in one transaction. Throws
   * 409 `HRMS_SETTINGS_CHANGED` when the stored `updatedAt` is not
   * `expectedUpdatedAt` (null = never saved).
   */
  save(input: {
    workspaceId: string;
    settings: HrmsSettings;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
};

/**
 * Read and replace the Company's HRMS Settings (CM-303). Menu
 * `hrms.settings`: `read` to see them, `update` to save them. Other hrms
 * code reads them through `HrmsSettingsReader`, with no access check.
 */
export class HrmsSettingsHandlers {
  constructor(
    private readonly store: HrmsSettingsStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The settings in force; the defaults with `updatedAt` null before the first save. */
  async getHrmsSettings(input: {
    access: MemberAccess;
  }): Promise<StoredHrmsSettings> {
    assertCan(input.access, "hrms.settings", "read");
    return this.store.find(input.access.workspaceId);
  }

  /**
   * Replaces every setting at once (the screen saves the whole form).
   * 400 for a rule broken (`details.field` names it), 409
   * `HRMS_SETTINGS_CHANGED` when someone saved after `expectedUpdatedAt`.
   */
  async updateHrmsSettings(input: {
    access: MemberAccess;
    settings: HrmsSettingsInput;
    /** The `updatedAt` the caller loaded; null when it loaded the defaults. */
    expectedUpdatedAt: Date | null;
  }): Promise<StoredHrmsSettings> {
    assertCan(input.access, "hrms.settings", "update");
    const settings = createHrmsSettings(input.settings);
    const now = this.clock();
    await this.store.save({
      workspaceId: input.access.workspaceId,
      settings,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.access.userId,
      now,
    });
    return { settings, updatedAt: now };
  }
}
