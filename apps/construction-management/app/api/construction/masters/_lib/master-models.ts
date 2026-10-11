import { z } from "zod";

import {
  LABOUR_SKILLS,
  type LabourSkill,
} from "@/src/masters/domain/master-kind";

/** `{id}` in every masters item route. */
export const ConstructionMastersIdParamsModel = z.object({ id: z.uuid() });

/** `?status=` on every masters list: all live rows (default), or one state. */
export const ListConstructionMastersQueryModel = z.object({
  status: z
    .enum(["all", "enabled", "disabled"])
    .optional()
    .default("all")
    .describe(
      "`enabled` for pickers; `all` (default) lists disabled rows too, each with `disabled: true`.",
    ),
});

export function expectedUpdatedAt(code: string) {
  return z.iso
    .datetime()
    .describe(
      `The \`updatedAt\` you loaded. A mismatch is 409 ${code}_CHANGED.`,
    );
}

/** Trimmed and checked (required, at most 100) by the domain. */
const name = z.string().max(1000);

/**
 * Request and Response models of a name-only list (Labour Categories,
 * Departments). Each call makes new schema objects, because OpenAPI
 * component names are per schema object.
 */
export function lookupModels(code: string) {
  const response = z.object({
    id: z.uuid(),
    name: z.string(),
    /** Copied from the seed set when the Company was created ("Default"). */
    isSeed: z
      .boolean()
      .describe("Came with the app: can be disabled, not renamed or deleted."),
    disabled: z.boolean().describe("Off the pickers; old records keep it."),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  return {
    response,
    list: z.object({
      items: z.array(response),
      total: z.int().nonnegative(),
    }),
    create: z.object({ name }),
    update: z.object({ name, expectedUpdatedAt: expectedUpdatedAt(code) }),
  };
}

/** A lookup row as every list answers it; Labour Categories add `skill`. */
export type LookupResponseModel = z.infer<
  ReturnType<typeof lookupModels>["response"]
> & { skill?: LabourSkill };

/** What the lookup routes read and write; `skill` is Labour Categories' only. */
export type LookupModels = {
  response: z.ZodType<LookupResponseModel>;
  list: z.ZodType<{ items: LookupResponseModel[]; total: number }>;
  create: z.ZodType<{ name: string; skill?: LabourSkill }>;
  update: z.ZodType<{
    name: string;
    expectedUpdatedAt: string;
    skill?: LabourSkill;
  }>;
};

const skill = z
  .enum(LABOUR_SKILLS)
  .describe(
    "How the category's heads count on a Daily Worksheet's labour prefill (CM-0016 §6).",
  );

/**
 * Labour Categories' models (CM-203, CM-601): a lookup row with a skill.
 * Create defaults it to skilled; update leaves it as is when left out, and
 * a seed row may change it (not its name).
 */
export function labourCategoryModels() {
  const base = lookupModels("LABOUR_CATEGORY");
  const response = base.response.extend({ skill });
  return {
    response,
    list: z.object({
      items: z.array(response),
      total: z.int().nonnegative(),
    }),
    create: z.object({
      name,
      skill: skill.optional().describe("Skilled unless given."),
    }),
    update: z.object({
      name,
      expectedUpdatedAt: expectedUpdatedAt("LABOUR_CATEGORY"),
      skill: skill
        .optional()
        .describe(
          "Left as is when left out. A seed category keeps its name but its skill may change.",
        ),
    }),
  };
}
