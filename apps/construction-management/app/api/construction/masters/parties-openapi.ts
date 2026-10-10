import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionMastersIdParamsModel } from "./_lib/master-models";
import { ListConstructionMastersPartiesQueryModel } from "./_lib/party-models";
import {
  AddConstructionMastersQuotationRequestModel,
  ConstructionMastersQuotationParamsModel,
  ConstructionMastersQuotationResponseModel,
  ListConstructionMastersPartyQuotationsResponseModel,
  ListConstructionMastersQuotationsQueryModel,
  ListConstructionMastersQuotationsResponseModel,
  StartConstructionMastersQuotationUploadRequestModel,
  StartConstructionMastersQuotationUploadResponseModel,
} from "./_lib/quotation-models";
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
  ConstructionMastersQuotationResponseModel,
  ListConstructionMastersPartyQuotationsResponseModel,
  ListConstructionMastersQuotationsResponseModel,
  StartConstructionMastersQuotationUploadRequestModel,
  StartConstructionMastersQuotationUploadResponseModel,
  AddConstructionMastersQuotationRequestModel,
};

const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;

function quotationOperations(path: string, label: string, menu: string): OpenApiOperation[] {
  const base = `${path}/{id}/quotations`;
  const params = ConstructionMastersIdParamsModel;
  const file = ConstructionMastersQuotationParamsModel;
  return [
    {
      method: "get",
      path: base,
      summary: `The ${label}'s quotation files, newest first (\`${menu}\` or \`masters.quotations\`, read)`,
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: "Quotations",
      successSchema: ListConstructionMastersPartyQuotationsResponseModel,
      errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${base}/uploads`,
      summary: `Start a quotation upload: a PDF or an image, at most 10 MB, 50 per ${label} (\`${menu}\`, update)`,
      tags: MASTERS,
      params,
      body: StartConstructionMastersQuotationUploadRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "Where the bytes go",
      successSchema: StartConstructionMastersQuotationUploadResponseModel,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${base}/uploads/app`,
      summary: "Development and tests: the raw file at `?key=` (404 when deployed)",
      tags: MASTERS,
      params,
      bodyBinaryContentTypes: ["application/octet-stream"],
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Received",
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${base}/uploads/thumbnail`,
      summary: "An image's WebP thumbnail at `?key=`, before finishing",
      tags: MASTERS,
      params,
      bodyBinaryContentTypes: ["image/webp"],
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Received",
      errors: [...WRITE, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${base}/uploads/presign`,
      summary: "Deployed: the `uploadPresigned()` handshake for one key (404 with files on disk)",
      tags: MASTERS,
      params,
      successStatus: StatusCodes.OK,
      successDescription: "The presigned URL payload",
      errors: [...WRITE, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: base,
      summary: "Finish an upload: record the file at `key` (201 new, 200 when already recorded)",
      tags: MASTERS,
      params,
      body: AddConstructionMastersQuotationRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The quotation",
      successSchema: ConstructionMastersQuotationResponseModel,
      errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
    },
    {
      method: "get",
      path: `${base}/{quotationId}`,
      summary: "Stream one quotation; `?download=1` saves it",
      tags: MASTERS,
      params: file,
      successStatus: StatusCodes.OK,
      successDescription: "The file",
      successBinaryContentTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
      errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
    },
    {
      method: "get",
      path: `${base}/{quotationId}/thumbnail`,
      summary: "A quotation image's WebP thumbnail",
      tags: MASTERS,
      params: file,
      successStatus: StatusCodes.OK,
      successDescription: "The thumbnail",
      successBinaryContentTypes: ["image/webp"],
      errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
    },
    {
      method: "post",
      path: `${base}/{quotationId}/delete`,
      summary: `Remove a quotation (\`${menu}\`, update)`,
      tags: MASTERS,
      params: file,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Removed",
      errors: [...WRITE, StatusCodes.NOT_FOUND],
    },
  ];
}

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
      summary: `Delete a ${label} (a tombstone); 409 ${code}_ON_PROJECTS while on a live Project, ${code}_IN_USE while a document names it`,
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
  ...quotationOperations(`${BASE}/contractors`, "Contractor", "masters.contractors"),
  ...quotationOperations(`${BASE}/suppliers`, "Supplier", "masters.suppliers"),
  {
    method: "get",
    path: `${BASE}/quotations`,
    summary:
      "View Quotations: every live Contractor's and Supplier's quotation files, newest first (menu `masters.quotations`, read)",
    tags: MASTERS,
    query: ListConstructionMastersQuotationsQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of quotations",
    successSchema: ListConstructionMastersQuotationsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
];
