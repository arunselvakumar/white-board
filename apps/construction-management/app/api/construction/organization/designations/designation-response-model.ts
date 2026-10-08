import { z } from "zod";

import type { DesignationReadModel } from "@/src/organization/application/designation-read-model";

import { designationTemplateModel } from "./designation-template";

export const ConstructionOrganizationDesignationResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Copied from the seed set when the Company was created ("Default"). */
  isSeed: z.boolean(),
  template: designationTemplateModel.nullable(),
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
    template: item.template,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
