import { z } from "zod";

import {
  backdatedLimitFields,
  backdatedModeField,
  backdatedModuleKeys,
  financialClosingDateField,
} from "../backdated-entry-policy-fields";

/** The whole policy; modules left out are set back to `global`. */
export const UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel =
  z.object({
    create: backdatedLimitFields,
    edit: backdatedLimitFields,
    financialClosingDate: financialClosingDateField,
    modules: z
      .array(
        z.object({
          key: z.enum(backdatedModuleKeys),
          mode: backdatedModeField,
          create: backdatedLimitFields,
          edit: backdatedLimitFields,
        }),
      )
      .max(backdatedModuleKeys.length)
      .default([]),
    expectedUpdatedAt: z.iso
      .datetime()
      .nullable()
      .describe(
        "The `updatedAt` you loaded (null if never saved). A mismatch is 409 BACKDATED_POLICY_CHANGED.",
      ),
  });

export type UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel =
  z.input<
    typeof UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel
  >;
