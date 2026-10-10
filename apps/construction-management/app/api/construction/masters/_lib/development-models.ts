import { z } from "zod";

import { expectedUpdatedAt } from "./master-models";

/** Trimmed and checked (required, at most 100) by the domain. */
const name = z.string().max(1000);

const projectIds = z
  .array(z.string().max(100))
  .max(500)
  .describe(
    "Live Projects the caller may see; 400 PROJECT_NOT_FOUND with `details.projectIds` otherwise.",
  );

/**
 * Request and Response models of an Amenities or Common Developments list
 * (CM-404): a name-only list whose rows are assigned to Projects. Each call
 * makes new schema objects, because OpenAPI component names are per schema
 * object.
 */
export function developmentModels(code: string, label: string) {
  const response = z.object({
    id: z.uuid(),
    name: z.string(),
    isSeed: z
      .boolean()
      .describe("Came with the app: can be disabled, not renamed or deleted."),
    disabled: z
      .boolean()
      .describe(
        "Off the pickers: stays on the Projects that have it, cannot be assigned to more.",
      ),
    projectIds: z
      .array(z.uuid())
      .describe(
        `Live Projects this ${label} is assigned to, by name; a Member sees only their own Projects.`,
      ),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  return {
    response,
    list: z.object({
      items: z.array(response),
      total: z.int().nonnegative(),
    }),
    create: z.object({
      name,
      projectIds: projectIds.optional().describe("Projects to assign it to."),
    }),
    update: z.object({ name, expectedUpdatedAt: expectedUpdatedAt(code) }),
    assign: z.object({
      projectIds: projectIds.describe(
        `Every Project the ${label} should be on, among those the caller may see (links to other Projects are kept). 400 PROJECT_NOT_FOUND for another id, ${code}_DISABLED when a disabled row would gain a Project.`,
      ),
    }),
  };
}

export type DevelopmentModels = ReturnType<typeof developmentModels>;

export type DevelopmentResponseModel = z.infer<DevelopmentModels["response"]>;
