import { z } from "zod";

import type { TrackingMasterReadModel } from "@/src/masters/application/tracking-master-handlers";

import { expectedUpdatedAt } from "./master-models";

/** Trimmed and checked (required, at most 100) by the domain. */
const name = z
  .string()
  .max(1000)
  .describe(
    "Required, at most 100 characters; unique among the Company's live rows ignoring case.",
  );

const can = z
  .object({
    create: z.boolean(),
    update: z.boolean(),
    delete: z.boolean(),
  })
  .describe("What the caller may do on this list; routes check again.");

const inUse = z
  .boolean()
  .describe("A live tracking record names it, so it cannot be deleted.");

/** Issue Categories' models (CM-801). */
export function issueCategoryModels() {
  const response = z.object({
    id: z.uuid(),
    name: z.string(),
    isSeed: z
      .boolean()
      .describe(
        "One of the 14 every Company starts with: renamed, disabled, deleted when unused, like any other.",
      ),
    disabled: z
      .boolean()
      .describe("Off the issue form's picker; old issues keep it."),
    inUse,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  return {
    response,
    list: z.object({
      items: z.array(response).describe("By name."),
      total: z.int().nonnegative(),
      can,
    }),
    create: z.object({ name }),
    update: z.object({
      name,
      expectedUpdatedAt: expectedUpdatedAt("ISSUE_CATEGORY"),
    }),
  };
}

/** Tags' models (CM-801). */
export function tagModels() {
  const response = z.object({
    id: z.uuid(),
    name: z.string(),
    inUse,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  return {
    response,
    list: z.object({
      items: z.array(response).describe("By name."),
      total: z.int().nonnegative(),
      can,
    }),
    create: z.object({ name }),
    update: z.object({ name, expectedUpdatedAt: expectedUpdatedAt("TAG") }),
  };
}

export function toIssueCategoryResponse(item: TrackingMasterReadModel) {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    disabled: item.disabled,
    inUse: item.inUse,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toTagResponse(item: TrackingMasterReadModel) {
  return {
    id: item.id,
    name: item.name,
    inUse: item.inUse,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
