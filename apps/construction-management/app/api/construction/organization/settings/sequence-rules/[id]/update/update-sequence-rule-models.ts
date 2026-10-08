import { z } from "zod";

import {
  sequenceRuleResponseFields,
  sequenceRuleSettingsFields,
} from "../../sequence-rule-fields";

/** Module and Project are fixed; only the number format changes. */
export const UpdateConstructionOrganizationSequenceRuleRequestModel = z.object({
  ...sequenceRuleSettingsFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded. A mismatch is 409 SEQUENCE_RULE_CHANGED.",
    ),
});

export type UpdateConstructionOrganizationSequenceRuleRequestModel = z.infer<
  typeof UpdateConstructionOrganizationSequenceRuleRequestModel
>;

export const UpdateConstructionOrganizationSequenceRuleResponseModel = z.object(
  sequenceRuleResponseFields,
);

export type UpdateConstructionOrganizationSequenceRuleResponseModel = z.infer<
  typeof UpdateConstructionOrganizationSequenceRuleResponseModel
>;
