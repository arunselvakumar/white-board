import { z } from "zod";

import type { DesignationReadModel } from "@/src/organization/application/designation-read-model";

export const ConstructionOrganizationDesignationResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Copied from the seed set when the Company was created ("Default"). */
  isSeed: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionOrganizationDesignationResponseModel = z.infer<
  typeof ConstructionOrganizationDesignationResponseModel
>;

export function toDesignationResponse(
  item: DesignationReadModel,
): ConstructionOrganizationDesignationResponseModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
