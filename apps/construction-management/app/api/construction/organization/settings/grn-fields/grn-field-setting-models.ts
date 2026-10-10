import { z } from "zod";

import type { GrnFieldSetting } from "@/src/organization/domain/grn-field-setting";
import {
  GRN_FIELD_GROUPS,
  GRN_FIELD_INFO,
  GRN_OPTIONAL_FIELDS,
} from "@/src/shared-kernel/grn-fields";

export const GRN_FIELDS_PATH =
  "/api/construction/organization/settings/grn-fields";

const grnField = z.enum(GRN_OPTIONAL_FIELDS);

export const GetConstructionOrganizationGrnFieldSettingResponseModel = z.object(
  {
    hiddenFields: z
      .array(grnField)
      .describe(
        "Optional GRN fields neither shown on the form nor printed, in screen order.",
      ),
    fields: z
      .array(
        z.object({
          key: grnField,
          label: z.string(),
          group: z.enum(GRN_FIELD_GROUPS),
        }),
      )
      .describe("Every optional GRN field, in screen order."),
    updatedAt: z.iso
      .datetime()
      .nullable()
      .describe("Null until the setting is first saved."),
  },
);

export type GetConstructionOrganizationGrnFieldSettingResponseModel = z.infer<
  typeof GetConstructionOrganizationGrnFieldSettingResponseModel
>;

/** The whole list of hidden fields; any field left out is shown. */
export const UpdateConstructionOrganizationGrnFieldSettingRequestModel =
  z.object({
    hiddenFields: z.array(grnField).max(GRN_OPTIONAL_FIELDS.length * 2),
    expectedUpdatedAt: z.iso
      .datetime()
      .nullable()
      .describe(
        "The `updatedAt` you loaded (null if never saved). A mismatch is 409 GRN_FIELD_SETTING_CHANGED.",
      ),
  });

export type UpdateConstructionOrganizationGrnFieldSettingRequestModel = z.input<
  typeof UpdateConstructionOrganizationGrnFieldSettingRequestModel
>;

export function mapGrnFieldSetting(
  setting: GrnFieldSetting,
): GetConstructionOrganizationGrnFieldSettingResponseModel {
  return {
    hiddenFields: setting.hiddenFields,
    fields: GRN_OPTIONAL_FIELDS.map((key) => ({
      key,
      label: GRN_FIELD_INFO[key].label,
      group: GRN_FIELD_INFO[key].group,
    })),
    updatedAt: setting.updatedAt?.toISOString() ?? null,
  };
}
