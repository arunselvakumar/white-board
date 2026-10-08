import { z } from "zod";

import {
  sequenceModuleKeys,
  sequenceRuleResponseFields,
  sequenceRuleSettingsFields,
} from "./sequence-rule-fields";

export const CreateConstructionOrganizationSequenceRuleRequestModel = z.object({
  module: z.enum(sequenceModuleKeys),
  projectId: z
    .uuid()
    .nullable()
    .describe(
      "Null for the module's default rule (All projects). Project rules arrive with Projects (M2).",
    ),
  ...sequenceRuleSettingsFields,
});

export type CreateConstructionOrganizationSequenceRuleRequestModel = z.infer<
  typeof CreateConstructionOrganizationSequenceRuleRequestModel
>;

export const CreateConstructionOrganizationSequenceRuleResponseModel = z.object(
  sequenceRuleResponseFields,
);

export type CreateConstructionOrganizationSequenceRuleResponseModel = z.infer<
  typeof CreateConstructionOrganizationSequenceRuleResponseModel
>;
