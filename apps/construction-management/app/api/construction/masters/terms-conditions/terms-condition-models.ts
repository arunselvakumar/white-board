import { z } from "zod";

import type { TermsConditionReadModel } from "@/src/masters/application/material-master-handlers";

import { expectedUpdatedAt } from "../_lib/master-models";
import { pagedListModel, pagedListQuery } from "../_lib/paged-master-routes";

const fields = {
  title: z
    .string()
    .max(1000)
    .describe(
      "Required, at most 120 characters; unique among live rows ignoring case (409 TERMS_CONDITION_NAME_IN_USE).",
    ),
  body: z
    .string()
    .max(20_000)
    .describe("Required, at most 5,000 characters; line breaks are kept."),
};

export const ConstructionMastersTermsConditionResponseModel = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  disabled: z.boolean().describe("Off the Purchase Order picker."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersTermsConditionResponseModel = z.infer<
  typeof ConstructionMastersTermsConditionResponseModel
>;

export const ListConstructionMastersTermsConditionsQueryModel =
  pagedListQuery({});

export const ListConstructionMastersTermsConditionsResponseModel =
  pagedListModel(ConstructionMastersTermsConditionResponseModel);
export type ListConstructionMastersTermsConditionsResponseModel = z.infer<
  typeof ListConstructionMastersTermsConditionsResponseModel
>;

export const CreateConstructionMastersTermsConditionRequestModel =
  z.object(fields);
export type CreateConstructionMastersTermsConditionRequestModel = z.infer<
  typeof CreateConstructionMastersTermsConditionRequestModel
>;

export const UpdateConstructionMastersTermsConditionRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: expectedUpdatedAt("TERMS_CONDITION"),
});
export type UpdateConstructionMastersTermsConditionRequestModel = z.infer<
  typeof UpdateConstructionMastersTermsConditionRequestModel
>;

export function toTermsConditionResponse(
  item: TermsConditionReadModel,
): ConstructionMastersTermsConditionResponseModel {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
