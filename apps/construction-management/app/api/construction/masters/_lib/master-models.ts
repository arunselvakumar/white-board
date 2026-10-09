import { z } from "zod";

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

export type LookupModels = ReturnType<typeof lookupModels>;

export type LookupResponseModel = z.infer<LookupModels["response"]>;
