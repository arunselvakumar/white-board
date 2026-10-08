import { z } from "zod";

import type { SequenceRuleRecord } from "@/src/organization/application/sequence-rule-handlers";
import {
  SEQUENCE_LIMITS,
  SEQUENCE_MODULES,
  SEQUENCE_SEPARATORS,
  type SequenceModuleKey,
} from "@/src/shared-kernel/sequence";

export const sequenceModuleKeys = SEQUENCE_MODULES.map((item) => item.key) as [
  SequenceModuleKey,
  ...SequenceModuleKey[],
];

const token = z
  .string()
  .max(SEQUENCE_LIMITS.tokenLength)
  .regex(/^[A-Za-z0-9/_.\s-]*$/, "Letters, digits and / - _ . only");

/** The settings a rule's create and update both take. */
export const sequenceRuleSettingsFields = {
  prefix: token.describe("First part, e.g. `PR`."),
  projectToken: token.describe("Part after the fiscal year, e.g. `P1`."),
  startNumber: z
    .number()
    .int()
    .min(1)
    .max(SEQUENCE_LIMITS.maxStartNumber)
    .describe("First number of each fiscal year (or ever, without the token)."),
  padding: z
    .number()
    .int()
    .min(SEQUENCE_LIMITS.minPadding)
    .max(SEQUENCE_LIMITS.maxPadding)
    .describe("Digits the counter is padded to."),
  separator: z.enum(SEQUENCE_SEPARATORS),
  fiscalYearToken: z
    .boolean()
    .describe(
      "Adds `26-27` after the prefix and restarts the counter every 1 April.",
    ),
};

export const sequenceRuleResponseFields = {
  id: z.uuid(),
  module: z.enum(sequenceModuleKeys),
  scope: z.enum(["workspace", "project"]),
  projectId: z.string().nullable(),
  isDefault: z.boolean().describe("The rule for All projects."),
  ...sequenceRuleSettingsFields,
  issued: z
    .boolean()
    .describe("A number has been issued; the rule can no longer be deleted."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const SequenceRuleResponseObject = z.object(sequenceRuleResponseFields);

export function mapSequenceRule(
  rule: SequenceRuleRecord,
): z.infer<typeof SequenceRuleResponseObject> {
  return {
    id: rule.id,
    module: rule.module,
    scope: rule.projectId == null ? "workspace" : "project",
    projectId: rule.projectId,
    isDefault: rule.projectId == null,
    prefix: rule.prefix,
    projectToken: rule.projectToken,
    startNumber: rule.startNumber,
    padding: rule.padding,
    separator: rule.separator,
    fiscalYearToken: rule.fiscalYearToken,
    issued: rule.issued,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
