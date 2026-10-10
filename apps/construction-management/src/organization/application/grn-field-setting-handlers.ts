import {
  grnHiddenFields,
  type GrnFieldSetting,
  type GrnOptionalField,
} from "../domain/grn-field-setting";

export type GrnFieldSettingStore = {
  /** The Company's setting; nothing hidden and `updatedAt` null when never saved. */
  find(workspaceId: string): Promise<GrnFieldSetting>;
  /**
   * Upserts the row and audits `grn_fields.updated` in one transaction; 409
   * `GRN_FIELD_SETTING_CHANGED` when the stored `updatedAt` is not
   * `expectedUpdatedAt` (null = never saved).
   */
  save(input: {
    workspaceId: string;
    hiddenFields: GrnOptionalField[];
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
};

/** Settings → GRN fields (CM-501, ADR CM-0015 §9). Access is checked by the caller. */
export class GrnFieldSettingHandlers {
  constructor(
    private readonly store: GrnFieldSettingStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  get(workspaceId: string): Promise<GrnFieldSetting> {
    return this.store.find(workspaceId);
  }

  async update(input: {
    workspaceId: string;
    hiddenFields: readonly string[];
    expectedUpdatedAt: Date | null;
    by: string;
  }): Promise<GrnFieldSetting> {
    const hiddenFields = grnHiddenFields(input.hiddenFields);
    const now = this.clock();
    await this.store.save({
      workspaceId: input.workspaceId,
      hiddenFields,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.by,
      now,
    });
    return { hiddenFields, updatedAt: now };
  }
}
