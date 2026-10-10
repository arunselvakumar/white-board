import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionMastersIdParamsModel } from "./_lib/master-models";
import {
  AssignConstructionMastersAmenityProjectsRequestModel,
  ConstructionMastersAmenityResponseModel,
  CreateConstructionMastersAmenityRequestModel,
  ListConstructionMastersAmenitiesResponseModel,
  UpdateConstructionMastersAmenityRequestModel,
} from "./amenities/amenity-models";
import {
  AssignConstructionMastersCommonDevelopmentProjectsRequestModel,
  ConstructionMastersCommonDevelopmentResponseModel,
  CreateConstructionMastersCommonDevelopmentRequestModel,
  ListConstructionMastersCommonDevelopmentsResponseModel,
  UpdateConstructionMastersCommonDevelopmentRequestModel,
} from "./common-developments/common-development-models";
import { MASTERS, WRITE, masterOperations } from "./masters-openapi";

/** Amenities' and Common Developments' models (CM-404). */
export const developmentOpenApiComponents: OpenApiComponents = {
  ListConstructionMastersAmenitiesResponseModel,
  ConstructionMastersAmenityResponseModel,
  CreateConstructionMastersAmenityRequestModel,
  UpdateConstructionMastersAmenityRequestModel,
  AssignConstructionMastersAmenityProjectsRequestModel,
  ListConstructionMastersCommonDevelopmentsResponseModel,
  ConstructionMastersCommonDevelopmentResponseModel,
  CreateConstructionMastersCommonDevelopmentRequestModel,
  UpdateConstructionMastersCommonDevelopmentRequestModel,
  AssignConstructionMastersCommonDevelopmentProjectsRequestModel,
};

const BASE = "/api/construction/masters";

function developmentOperations(input: {
  path: string;
  label: string;
  plural: string;
  menu: string;
  code: string;
  list: z.ZodType;
  item: z.ZodType;
  create: z.ZodType;
  update: z.ZodType;
  assign: z.ZodType;
}): OpenApiOperation[] {
  return [
    ...masterOperations({
      ...input,
      inUse: `409 SEED_IS_READ_ONLY for a seed row, ${input.code}_IN_USE while a live Project has it.`,
    }),
    {
      method: "post",
      path: `${input.path}/{id}/projects`,
      summary: `Assign a ${input.label} to exactly these Projects among those you may see; links to other Projects are kept (menu \`${input.menu}\`, update; 400 PROJECT_NOT_FOUND, ${input.code}_DISABLED)`,
      tags: MASTERS,
      params: ConstructionMastersIdParamsModel,
      body: input.assign,
      successStatus: StatusCodes.OK,
      successDescription: `The ${input.label} with its Projects`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND],
    },
  ];
}

/** Amenities' and Common Developments' routes (root ADR-0012). */
export const developmentOpenApiOperations: OpenApiOperation[] = [
  ...developmentOperations({
    path: `${BASE}/amenities`,
    label: "Amenity",
    plural: "Amenities",
    menu: "masters.amenities",
    code: "AMENITY",
    list: ListConstructionMastersAmenitiesResponseModel,
    item: ConstructionMastersAmenityResponseModel,
    create: CreateConstructionMastersAmenityRequestModel,
    update: UpdateConstructionMastersAmenityRequestModel,
    assign: AssignConstructionMastersAmenityProjectsRequestModel,
  }),
  ...developmentOperations({
    path: `${BASE}/common-developments`,
    label: "Common Development",
    plural: "Common Developments",
    menu: "masters.common_developments",
    code: "COMMON_DEVELOPMENT",
    list: ListConstructionMastersCommonDevelopmentsResponseModel,
    item: ConstructionMastersCommonDevelopmentResponseModel,
    create: CreateConstructionMastersCommonDevelopmentRequestModel,
    update: UpdateConstructionMastersCommonDevelopmentRequestModel,
    assign: AssignConstructionMastersCommonDevelopmentProjectsRequestModel,
  }),
];
