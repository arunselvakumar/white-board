import { z } from "zod";

import {
  BACKDATED_MODULE_GROUPS,
  BACKDATED_MODULES,
  MAX_BACKDATED_DAYS,
  type BackdatedModuleKey,
} from "@/src/shared-kernel/backdated-policy";

export const backdatedModuleKeys = BACKDATED_MODULES.map(
  (item) => item.key,
) as [BackdatedModuleKey, ...BackdatedModuleKey[]];

export const backdatedModuleGroupKeys = BACKDATED_MODULE_GROUPS.map(
  (group) => group.key,
) as [
  (typeof BACKDATED_MODULE_GROUPS)[number]["key"],
  ...(typeof BACKDATED_MODULE_GROUPS)[number]["key"][],
];

export const backdatedLimitFields = z.object({
  days: z
    .number()
    .int()
    .min(0)
    .max(MAX_BACKDATED_DAYS)
    .describe("How many days back an entry may be dated. 0 = no restriction."),
  overrideDesignationIds: z
    .array(z.uuid())
    .max(200)
    .describe(
      "Designations allowed past the limit. Empty = hard block for everyone but the Owner.",
    ),
});

export const financialClosingDateField = z.iso
  .date()
  .nullable()
  .describe(
    "Inclusive. Entries dated on or before it cannot be created or edited by anyone, the Owner included.",
  );

export const backdatedModeField = z
  .enum(["global", "custom"])
  .describe("`global` uses the default limits; `custom` uses its own.");
