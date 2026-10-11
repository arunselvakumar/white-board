import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { XLSX_CONTENT_TYPE } from "@/src/finance/infrastructure/transaction-workbook";

import {
  ApproveConstructionFinanceTransactionRequestModel,
  BulkDecideConstructionFinanceTransactionsRequestModel,
  BulkDecideConstructionFinanceTransactionsResponseModel,
  ConstructionFinanceCounterpartyModel,
  ConstructionFinanceDocumentParamsModel,
  ConstructionFinanceRegisterItemModel,
  ConstructionFinanceTransactionResponseModel,
  ConstructionFinanceTransferResponseModel,
  CreateConstructionFinanceTransactionRequestModel,
  CreateConstructionFinanceTransferRequestModel,
  DeleteConstructionFinanceTransactionRequestModel,
  ImportConstructionFinanceTransactionsRequestModel,
  ImportConstructionFinanceTransactionsResponseModel,
  ListConstructionFinanceTransactionsRequestModel,
  ListConstructionFinanceTransactionsResponseModel,
  RejectConstructionFinanceTransactionRequestModel,
  TRANSACTIONS_PATH,
  TRANSFERS_PATH,
  UpdateConstructionFinanceTransactionRequestModel,
  UpdateConstructionFinanceTransferRequestModel,
} from "./transaction-models";

const TAGS = ["Construction · Finance"];
const READ = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE = [...READ, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED];
const MENU = "finance.transactions";

export const financeTransactionOpenApiComponents: OpenApiComponents = {
  ConstructionFinanceCounterpartyModel,
  CreateConstructionFinanceTransactionRequestModel,
  UpdateConstructionFinanceTransactionRequestModel,
  CreateConstructionFinanceTransferRequestModel,
  UpdateConstructionFinanceTransferRequestModel,
  ApproveConstructionFinanceTransactionRequestModel,
  RejectConstructionFinanceTransactionRequestModel,
  DeleteConstructionFinanceTransactionRequestModel,
  ConstructionFinanceTransactionResponseModel,
  ConstructionFinanceTransferResponseModel,
  ConstructionFinanceRegisterItemModel,
  ListConstructionFinanceTransactionsResponseModel,
  BulkDecideConstructionFinanceTransactionsRequestModel,
  BulkDecideConstructionFinanceTransactionsResponseModel,
  ImportConstructionFinanceTransactionsResponseModel,
};

function documentOperations(
  base: string,
  noun: string,
  response:
    | typeof ConstructionFinanceTransactionResponseModel
    | typeof ConstructionFinanceTransferResponseModel,
  update:
    | typeof UpdateConstructionFinanceTransactionRequestModel
    | typeof UpdateConstructionFinanceTransferRequestModel,
): OpenApiOperation[] {
  const item = `${base}/{id}`;
  return [
    {
      method: "get",
      path: item,
      summary: `One ${noun} (${MENU}, read on its Project)`,
      tags: TAGS,
      params: ConstructionFinanceDocumentParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: `The ${noun}`,
      successSchema: response,
      errors: READ,
    },
    {
      method: "post",
      path: `${item}/update`,
      summary: `Edit a ${noun}: approved → reversed and pending; rejected → pending (${MENU}, update)`,
      tags: TAGS,
      params: ConstructionFinanceDocumentParamsModel,
      body: update,
      successStatus: StatusCodes.OK,
      successDescription: `The ${noun}`,
      successSchema: response,
      errors: WRITE,
    },
    {
      method: "post",
      path: `${item}/approve`,
      summary: `Approve a pending ${noun} and post its entries; FINANCIAL_PERIOD_CLOSED 403 on or before the closing date (${MENU}, approve)`,
      tags: TAGS,
      params: ConstructionFinanceDocumentParamsModel,
      body: ApproveConstructionFinanceTransactionRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: `The ${noun}`,
      successSchema: response,
      errors: WRITE,
    },
    {
      method: "post",
      path: `${item}/reject`,
      summary: `Reject a pending ${noun} with a reason (${MENU}, reject)`,
      tags: TAGS,
      params: ConstructionFinanceDocumentParamsModel,
      body: RejectConstructionFinanceTransactionRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: `The ${noun}`,
      successSchema: response,
      errors: WRITE,
    },
    {
      method: "post",
      path: `${item}/delete`,
      summary: `Delete a ${noun}; an approved one is reversed first (${MENU}, delete)`,
      tags: TAGS,
      params: ConstructionFinanceDocumentParamsModel,
      body: DeleteConstructionFinanceTransactionRequestModel,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: WRITE,
    },
  ];
}

export const financeTransactionOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: TRANSACTIONS_PATH,
    summary: `Transactions register: a Project's Transactions and transfers with filters and totals; without projectId, the Company-wide list (Owner) (${MENU}, read)`,
    tags: TAGS,
    query: ListConstructionFinanceTransactionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page, newest first",
    successSchema: ListConstructionFinanceTransactionsResponseModel,
    errors: READ,
  },
  {
    method: "post",
    path: TRANSACTIONS_PATH,
    summary: `Record a Payment In / Out (Save, or Save & Approve with approve); DUPLICATE_REFERENCE 409 unless confirmed (${MENU}, create)`,
    tags: TAGS,
    body: CreateConstructionFinanceTransactionRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Transaction",
    successSchema: ConstructionFinanceTransactionResponseModel,
    errors: WRITE,
  },
  ...documentOperations(
    TRANSACTIONS_PATH,
    "Transaction",
    ConstructionFinanceTransactionResponseModel,
    UpdateConstructionFinanceTransactionRequestModel,
  ),
  {
    method: "post",
    path: `${TRANSACTIONS_PATH}/bulk`,
    summary: `Bulk approve / reject Transactions and transfers, all or none (${MENU}, approve / reject on each Project)`,
    tags: TAGS,
    body: BulkDecideConstructionFinanceTransactionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were decided",
    successSchema: BulkDecideConstructionFinanceTransactionsResponseModel,
    errors: WRITE,
  },
  {
    method: "get",
    path: `${TRANSACTIONS_PATH}/import-sample`,
    summary: `The Transactions import sample (.xlsx) (${MENU}, read)`,
    tags: TAGS,
    query: ImportConstructionFinanceTransactionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: READ,
  },
  {
    method: "post",
    path: `${TRANSACTIONS_PATH}/import`,
    summary: `Import Transactions from the sample (the .xlsx as the body), all or none — IMPORT_HAS_ERRORS 400 with per-row errors (${MENU}, create)`,
    tags: TAGS,
    query: ImportConstructionFinanceTransactionsRequestModel,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.CREATED,
    successDescription: "The rows became pending Transactions",
    successSchema: ImportConstructionFinanceTransactionsResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: TRANSFERS_PATH,
    summary: `Transfer between two accounts (mode fits the from account); Save or Save & Approve (${MENU}, create)`,
    tags: TAGS,
    body: CreateConstructionFinanceTransferRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The transfer",
    successSchema: ConstructionFinanceTransferResponseModel,
    errors: WRITE,
  },
  ...documentOperations(
    TRANSFERS_PATH,
    "transfer",
    ConstructionFinanceTransferResponseModel,
    UpdateConstructionFinanceTransferRequestModel,
  ),
];
