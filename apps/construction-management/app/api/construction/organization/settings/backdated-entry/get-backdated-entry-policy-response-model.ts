import { z } from "zod";

import {
  backdatedLimitFields,
  backdatedModeField,
  backdatedModuleGroupKeys,
  backdatedModuleKeys,
  financialClosingDateField,
} from "./backdated-entry-policy-fields";

export const backdatedEntryPolicyResponseFields = {
  create: backdatedLimitFields,
  edit: backdatedLimitFields,
  financialClosingDate: financialClosingDateField,
  modules: z
    .array(
      z.object({
        key: z.enum(backdatedModuleKeys),
        label: z.string(),
        group: z.enum(backdatedModuleGroupKeys),
        entryDateField: z
          .string()
          .describe("The field of the entry that is checked."),
        mode: backdatedModeField,
        create: backdatedLimitFields,
        edit: backdatedLimitFields,
      }),
    )
    .describe("All 24 modules, in screen order."),
  updatedAt: z.iso
    .datetime()
    .nullable()
    .describe("Null until the policy is first saved."),
};

export const GetConstructionOrganizationBackdatedEntryPolicyResponseModel =
  z.object(backdatedEntryPolicyResponseFields);

export type GetConstructionOrganizationBackdatedEntryPolicyResponseModel =
  z.infer<typeof GetConstructionOrganizationBackdatedEntryPolicyResponseModel>;
