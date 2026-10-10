import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionMastersIdParamsModel } from "./_lib/master-models";
import { ListConstructionMastersPartiesQueryModel } from "./_lib/party-models";
import {
  ConstructionMastersContractorResponseModel,
  CreateConstructionMastersContractorRequestModel,
  ListConstructionMastersContractorsResponseModel,
  UpdateConstructionMastersContractorRequestModel,
} from "./contractors/contractor-models";
import {
  ConstructionMastersSupplierResponseModel,
  CreateConstructionMastersSupplierRequestModel,
  ListConstructionMastersSuppliersResponseModel,
  UpdateConstructionMastersSupplierRequestModel,
} from "./suppliers/supplier-models";

const MASTERS = ["Construction · Masters"];

/** The Contractor and Supplier masters' models (CM-406). */
export const partiesOpenApiComponents: OpenApiComponents = {
  ConstructionMastersContractorResponseModel,
  ListConstructionMastersContractorsResponseModel,
  CreateConstructionMastersContractorRequestModel,
  UpdateConstructionMastersContractorRequestModel,
  ConstructionMastersSupplierResponseModel,
  ListConstructionMastersSuppliersResponseModel,
  CreateConstructionMastersSupplierRequestModel,
  UpdateConstructionMastersSupplierRequestModel,
};

const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;

function partyOperations(input: {
  path: string;
  label: string;
  plural: string;
  menu: string;
  code: string;
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
      summary: `${plural}, newest first, by name, contact person, GSTIN or mobile, with active and Project filters (menu \`${menu}\`, read)`,
      tags: MASTERS,
      query: ListConstructionMastersPartiesQueryModel,
      successStatus: StatusCodes.OK,
      successDescription: `A page of ${plural}`,
      successSchema: input.list,
      errors: [StatusCodes.BAD_REQUEST, ...SESSION],
    },
    {
      method: "post",
      path,
      summary: `Add a ${label} with its Projects (409 ${code}_NAME_IN_USE when a live one has the name)`,
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
      summary: `One ${label}, active or not`,
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
      summary: `Change a ${label} and its Projects with the \`updatedAt\` you loaded (409 when stale or the name is taken)`,
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
      path: `${path}/{id}/activate`,
      summary: `Put an inactive ${label} back on the pickers`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${path}/{id}/deactivate`,
      summary: `Take a ${label} off the pickers; they stay on their Projects`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: `The ${label}`,
      successSchema: input.item,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${path}/{id}/delete`,
      summary: `Delete a ${label} (a tombstone); 409 ${code}_ON_PROJECTS while on a live Project`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
  ];
}

const BASE = "/api/construction/masters";

/** The Contractor and Supplier masters' routes (CM-406, root ADR-0012). */
export const partiesOpenApiOperations: OpenApiOperation[] = [
  ...partyOperations({
    path: `${BASE}/contractors`,
    label: "Contractor",
    plural: "Contractors",
    menu: "masters.contractors",
    code: "CONTRACTOR",
    list: ListConstructionMastersContractorsResponseModel,
    item: ConstructionMastersContractorResponseModel,
    create: CreateConstructionMastersContractorRequestModel,
    update: UpdateConstructionMastersContractorRequestModel,
  }),
  ...partyOperations({
    path: `${BASE}/suppliers`,
    label: "Supplier",
    plural: "Suppliers",
    menu: "masters.suppliers",
    code: "SUPPLIER",
    list: ListConstructionMastersSuppliersResponseModel,
    item: ConstructionMastersSupplierResponseModel,
    create: CreateConstructionMastersSupplierRequestModel,
    update: UpdateConstructionMastersSupplierRequestModel,
  }),
];
