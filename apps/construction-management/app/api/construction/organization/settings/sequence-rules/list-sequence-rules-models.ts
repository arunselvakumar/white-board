import { z } from "zod";

import {
  SequenceRuleResponseObject,
  sequenceModuleKeys,
} from "./sequence-rule-fields";

export const ListConstructionOrganizationSequenceRulesQueryModel = z.object({
  module: z
    .enum(sequenceModuleKeys)
    .optional()
    .describe("Only this module's rules."),
});

/**
 * Every live rule (at most one default per module plus one per Project), so
 * the list is small and not paged.
 */
export const ListConstructionOrganizationSequenceRulesResponseModel = z.object({
  items: z.array(SequenceRuleResponseObject),
  total: z.number().int(),
});

export type ListConstructionOrganizationSequenceRulesResponseModel = z.infer<
  typeof ListConstructionOrganizationSequenceRulesResponseModel
>;
