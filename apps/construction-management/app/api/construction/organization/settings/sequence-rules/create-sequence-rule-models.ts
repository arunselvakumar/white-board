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
      "Null for the module's default rule (All projects), or a live Project's id.",
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
