import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionMastersIdParamsModel } from "./_lib/master-models";
import {
  ConstructionMastersMaterialCategoryResponseModel,
  CreateConstructionMastersMaterialCategoryRequestModel,
  ListConstructionMastersMaterialCategoriesQueryModel,
  ListConstructionMastersMaterialCategoriesResponseModel,
  UpdateConstructionMastersMaterialCategoryRequestModel,
} from "./material-categories/material-category-models";
import {
  ConstructionMastersMaterialResponseModel,
  CreateConstructionMastersMaterialRequestModel,
  ListConstructionMastersMaterialsQueryModel,
  ListConstructionMastersMaterialsResponseModel,
  UpdateConstructionMastersMaterialRequestModel,
} from "./materials/material-models";
import {
  ConstructionMastersMaterialOptionModel,
  ListConstructionMastersMaterialOptionsRequestModel,
  ListConstructionMastersMaterialOptionsResponseModel,
} from "./materials/options/material-option-models";
import {
  ConstructionMastersMeasurementUnitResponseModel,
  CreateConstructionMastersMeasurementUnitRequestModel,
  ListConstructionMastersMeasurementUnitsQueryModel,
  ListConstructionMastersMeasurementUnitsResponseModel,
  UpdateConstructionMastersMeasurementUnitRequestModel,
} from "./measurement-units/measurement-unit-models";
import {
  ConstructionMastersTermsConditionResponseModel,
  CreateConstructionMastersTermsConditionRequestModel,
  ListConstructionMastersTermsConditionsQueryModel,
  ListConstructionMastersTermsConditionsResponseModel,
  UpdateConstructionMastersTermsConditionRequestModel,
} from "./terms-conditions/terms-condition-models";

const MASTERS = ["Construction · Masters"];
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;

/** The procurement masters' models (CM-501). */
export const materialMastersOpenApiComponents: OpenApiComponents = {
  ConstructionMastersMeasurementUnitResponseModel,
  ListConstructionMastersMeasurementUnitsResponseModel,
  CreateConstructionMastersMeasurementUnitRequestModel,
  UpdateConstructionMastersMeasurementUnitRequestModel,
  ConstructionMastersMaterialCategoryResponseModel,
  ListConstructionMastersMaterialCategoriesResponseModel,
  CreateConstructionMastersMaterialCategoryRequestModel,
  UpdateConstructionMastersMaterialCategoryRequestModel,
  ConstructionMastersMaterialResponseModel,
  ListConstructionMastersMaterialsResponseModel,
  CreateConstructionMastersMaterialRequestModel,
  UpdateConstructionMastersMaterialRequestModel,
  ConstructionMastersMaterialOptionModel,
  ListConstructionMastersMaterialOptionsResponseModel,
  ConstructionMastersTermsConditionResponseModel,
  ListConstructionMastersTermsConditionsResponseModel,
  CreateConstructionMastersTermsConditionRequestModel,
  UpdateConstructionMastersTermsConditionRequestModel,
};

function pagedOperations(input: {
  path: string;
  label: string;
  plural: string;
  menu: string;
  code: string;
  deleteRule: string;
  query: z.ZodType;
  list: z.ZodType;
  item: z.ZodType;
  create: z.ZodType;
  update: z.ZodType;
}): OpenApiOperation[] {
  const { path, label, plural, menu, code } = input;
  const params = ConstructionMastersIdParamsModel;
  return [
    {
      method: "get",
      path,
      summary: `${plural}, newest first in cursor pages, searched and filtered by state (menu \`${menu}\`, read)`,
      tags: MASTERS,
      query: input.query,
      successStatus: StatusCodes.OK,
      successDescription: `A page of ${plural}`,
      successSchema: input.list,
      errors: [StatusCodes.BAD_REQUEST, ...SESSION],
    },
    {
      method: "post",
      path,
      summary: `Add a ${label} (409 ${code}_NAME_IN_USE when a live one has the name; menu \`${menu}\`, create)`,
      tags: MASTERS,
      body: input.create,
      successStatus: StatusCodes.CREATED,
      successDescription: `The new ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.CONFLICT],
    },
    {
      method: "get",
      path: `${path}/{id}`,
      summary: `One ${label}, enabled or disabled`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The ${label}`,
      successSchema: input.item,
      errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${path}/{id}/update`,
      summary: `Change a ${label} with the \`updatedAt\` you loaded (409 ${code}_CHANGED when stale, ${code}_NAME_IN_USE, SEED_IS_READ_ONLY for a seed row)`,
      tags: MASTERS,
      params,
      body: input.update,
      successStatus: StatusCodes.OK,
      successDescription: `The updated ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${path}/{id}/disable`,
      summary: `Take a ${label} off the pickers; what uses it keeps it (seed rows too)`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The disabled ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${path}/{id}/enable`,
      summary: `Put a disabled ${label} back on the pickers`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The enabled ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${path}/{id}/delete`,
      summary: `Delete a ${label} (a tombstone). ${input.deleteRule}`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
  ];
}

const BASE = "/api/construction/masters";

/** The procurement masters' routes (CM-501, root ADR-0012). */
export const materialMastersOpenApiOperations: OpenApiOperation[] = [
  ...pagedOperations({
    path: `${BASE}/measurement-units`,
    label: "Measurement Unit",
    plural: "Measurement Units",
    menu: "masters.units",
    code: "MEASUREMENT_UNIT",
    deleteRule:
      "409 SEED_IS_READ_ONLY for a seed unit, MEASUREMENT_UNIT_IN_USE while a Material is counted in it.",
    query: ListConstructionMastersMeasurementUnitsQueryModel,
    list: ListConstructionMastersMeasurementUnitsResponseModel,
    item: ConstructionMastersMeasurementUnitResponseModel,
    create: CreateConstructionMastersMeasurementUnitRequestModel,
    update: UpdateConstructionMastersMeasurementUnitRequestModel,
  }),
  ...pagedOperations({
    path: `${BASE}/material-categories`,
    label: "Material Category",
    plural: "Material Categories",
    menu: "masters.material_categories",
    code: "MATERIAL_CATEGORY",
    deleteRule:
      "409 SEED_IS_READ_ONLY for a seed category, MATERIAL_CATEGORY_IN_USE while Materials or sub-categories use it.",
    query: ListConstructionMastersMaterialCategoriesQueryModel,
    list: ListConstructionMastersMaterialCategoriesResponseModel,
    item: ConstructionMastersMaterialCategoryResponseModel,
    create: CreateConstructionMastersMaterialCategoryRequestModel,
    update: UpdateConstructionMastersMaterialCategoryRequestModel,
  }),
  ...pagedOperations({
    path: `${BASE}/materials`,
    label: "Material",
    plural: "Materials (Rate Details null without Financial)",
    menu: "masters.materials",
    code: "MATERIAL",
    deleteRule:
      "409 MATERIAL_IN_USE while a live procurement line or any stock entry names it.",
    query: ListConstructionMastersMaterialsQueryModel,
    list: ListConstructionMastersMaterialsResponseModel,
    item: ConstructionMastersMaterialResponseModel,
    create: CreateConstructionMastersMaterialRequestModel,
    update: UpdateConstructionMastersMaterialRequestModel,
  }),
  {
    method: "get",
    path: `${BASE}/materials/options`,
    summary:
      "The material picker: live, enabled Materials by name (`ids` also returns disabled ones a form has). Anyone with Materials Read or Read on a procurement menu; Rate Details null without Materials Financial",
    tags: MASTERS,
    query: ListConstructionMastersMaterialOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Material options",
    successSchema: ListConstructionMastersMaterialOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  ...pagedOperations({
    path: `${BASE}/terms-conditions`,
    label: "Terms & Conditions",
    plural: "Terms & Conditions",
    menu: "masters.terms_conditions",
    code: "TERMS_CONDITION",
    deleteRule: "Purchase Orders keep the text they copied.",
    query: ListConstructionMastersTermsConditionsQueryModel,
    list: ListConstructionMastersTermsConditionsResponseModel,
    item: ConstructionMastersTermsConditionResponseModel,
    create: CreateConstructionMastersTermsConditionRequestModel,
    update: UpdateConstructionMastersTermsConditionRequestModel,
  }),
];
