import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { XLSX_CONTENT_TYPE } from "@/src/contracts/infrastructure/item-workbook";

import {
  ConstructionContractsPriceIndexModel,
  ConstructionContractsPriceIndexParamsModel,
  CreateConstructionContractsPriceIndexRequestModel,
  ImportConstructionContractsPriceIndicesResponseModel,
  ListConstructionContractsPriceIndicesResponseModel,
  PRICE_INDICES_PATH,
  UpdateConstructionContractsPriceIndexRequestModel,
} from "./price-index-models";

const TAGS = ["Construction · Contracts"];
const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

/** Price indices' models (CM-1109). */
export const contractsPriceIndicesOpenApiComponents: OpenApiComponents = {
  ConstructionContractsPriceIndexModel,
  ListConstructionContractsPriceIndicesResponseModel,
  CreateConstructionContractsPriceIndexRequestModel,
  UpdateConstructionContractsPriceIndexRequestModel,
  ImportConstructionContractsPriceIndicesResponseModel,
};

/** Every price index operation (CM-1109); the Item Library's menu. */
export const contractsPriceIndicesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PRICE_INDICES_PATH,
    summary: "Price indices by series and month (Item Library read)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The series",
    successSchema: ListConstructionContractsPriceIndicesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: PRICE_INDICES_PATH,
    summary:
      "Add a month of a series (409 PRICE_INDEX_EXISTS; Item Library create)",
    tags: TAGS,
    body: CreateConstructionContractsPriceIndexRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The index",
    successSchema: ConstructionContractsPriceIndexModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PRICE_INDICES_PATH}/{id}/update`,
    summary: "Change a month's value (Item Library update)",
    tags: TAGS,
    params: ConstructionContractsPriceIndexParamsModel,
    body: UpdateConstructionContractsPriceIndexRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The index",
    successSchema: ConstructionContractsPriceIndexModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PRICE_INDICES_PATH}/{id}/delete`,
    summary: "Remove a month (Item Library delete)",
    tags: TAGS,
    params: ConstructionContractsPriceIndexParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PRICE_INDICES_PATH}/sample`,
    summary: "The price index import sample (.xlsx; Import flag)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The sample workbook",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${PRICE_INDICES_PATH}/import`,
    summary:
      "Import Series, Month and Value rows, all or none (IMPORT_HAS_ERRORS with details.errors; Import flag)",
    tags: TAGS,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.OK,
    successDescription: "How many were added, updated and unchanged",
    successSchema: ImportConstructionContractsPriceIndicesResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PRICE_INDICES_PATH}/export`,
    summary: "Every index as .xlsx in the sample's columns (Export flag)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The workbook",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: READ_ERRORS,
  },
];
