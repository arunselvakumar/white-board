import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  partyFileOpenApiComponents,
  partyFileOpenApiOperations,
} from "@/app/api/construction/labour/_party-files/party-file-openapi";
import { XLSX_CONTENT_TYPE } from "@/src/labour/infrastructure/labour-workbook";

import {
  ConstructionLabourLabourOptionResponseModel,
  ConstructionLabourLabourResponseModel,
  ConstructionLabourLabourTransferResponseModel,
  CreateConstructionLabourLabourRequestModel,
  ExportConstructionLabourLaboursRequestModel,
  ImportConstructionLabourLaboursRequestModel,
  ImportConstructionLabourLaboursResponseModel,
  LABOURS_PATH,
  LabourIdParamsModel,
  ListConstructionLabourLabourOptionsRequestModel,
  ListConstructionLabourLabourOptionsResponseModel,
  ListConstructionLabourLabourTransfersResponseModel,
  ListConstructionLabourLaboursRequestModel,
  ListConstructionLabourLaboursResponseModel,
  TransferConstructionLabourLaboursRequestModel,
  TransferConstructionLabourLaboursResponseModel,
  UpdateConstructionLabourLabourRequestModel,
} from "./labour-models";

const LABOUR = ["Construction · Labour"];

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

const ITEM_ERRORS = [
  StatusCodes.BAD_REQUEST,
  ...SESSION_ERRORS,
  StatusCodes.NOT_FOUND,
] as const;

const ITEM = `${LABOURS_PATH}/{id}`;

/** The Labour register's models (CM-205 – CM-207). */
export const labourOpenApiComponents: OpenApiComponents = {
  ConstructionLabourLabourResponseModel,
  ListConstructionLabourLaboursResponseModel,
  CreateConstructionLabourLabourRequestModel,
  UpdateConstructionLabourLabourRequestModel,
  TransferConstructionLabourLaboursRequestModel,
  TransferConstructionLabourLaboursResponseModel,
  ConstructionLabourLabourTransferResponseModel,
  ListConstructionLabourLabourTransfersResponseModel,
  ConstructionLabourLabourOptionResponseModel,
  ListConstructionLabourLabourOptionsResponseModel,
  ImportConstructionLabourLaboursResponseModel,
  ...partyFileOpenApiComponents,
};

/** The Labour register's routes (CM-205 – CM-207). */
export const labourOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: LABOURS_PATH,
    summary:
      "Labourers, newest first, by Project, Active, Supervisor, Labour Category and search (amounts null without Financial)",
    tags: LABOUR,
    query: ListConstructionLabourLaboursRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of labourers",
    successSchema: ListConstructionLabourLaboursResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: LABOURS_PATH,
    summary:
      "Add a labourer on a Project; the opening balance is posted to the ledger",
    tags: LABOUR,
    body: CreateConstructionLabourLabourRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The labourer",
    successSchema: ConstructionLabourLabourResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${LABOURS_PATH}/options`,
    summary:
      "Active labourers on a Project on a date, for attendance pickers (rates need Financial on Labour)",
    tags: LABOUR,
    query: ListConstructionLabourLabourOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Labourers by name",
    successSchema: ListConstructionLabourLabourOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: `${LABOURS_PATH}/transfer`,
    summary:
      "Transfer one or many labourers to a Project from a date (Labour transfer on every Project involved)",
    tags: LABOUR,
    body: TransferConstructionLabourLaboursRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The labourers, moved",
    successSchema: TransferConstructionLabourLaboursResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${LABOURS_PATH}/import-template`,
    summary:
      "The sample Excel sheet for the labour import, with the Company's Projects and categories",
    tags: LABOUR,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: `${LABOURS_PATH}/import`,
    summary:
      "Import labourers from the sample sheet (the .xlsx as the body): preview with ?dryRun=true, import all or nothing with false",
    tags: LABOUR,
    query: ImportConstructionLabourLaboursRequestModel,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.OK,
    successDescription:
      "The row-by-row preview (201 with `imported` when not a dry run)",
    successSchema: ImportConstructionLabourLaboursResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${LABOURS_PATH}/export`,
    summary:
      "The filtered register as an Excel sheet (amounts only with Financial)",
    tags: LABOUR,
    query: ExportConstructionLabourLaboursRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: ITEM,
    summary: "One labourer",
    tags: LABOUR,
    params: LabourIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The labourer",
    successSchema: ConstructionLabourLabourResponseModel,
    errors: [...ITEM_ERRORS],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a labourer; a changed opening balance reverses the old entry and posts the new one",
    tags: LABOUR,
    params: LabourIdParamsModel,
    body: UpdateConstructionLabourLabourRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The labourer",
    successSchema: ConstructionLabourLabourResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "post",
    path: `${ITEM}/activate`,
    summary: "Mark a labourer Active",
    tags: LABOUR,
    params: LabourIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The labourer",
    successSchema: ConstructionLabourLabourResponseModel,
    errors: [...ITEM_ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/deactivate`,
    summary: "Mark a labourer Inactive (they leave attendance pickers)",
    tags: LABOUR,
    params: LabourIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The labourer",
    successSchema: ConstructionLabourLabourResponseModel,
    errors: [...ITEM_ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete (hide) a labourer; 409 LABOUR_HAS_RECORDS once they have attendance or payments",
    tags: LABOUR,
    params: LabourIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${ITEM}/transfers`,
    summary: "The labourer's Project history, oldest first",
    tags: LABOUR,
    params: LabourIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Transfers",
    successSchema: ListConstructionLabourLabourTransfersResponseModel,
    errors: [...ITEM_ERRORS],
  },
  ...partyFileOpenApiOperations(LABOURS_PATH, "labourer", LABOUR),
];
