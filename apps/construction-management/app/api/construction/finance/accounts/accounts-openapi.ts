import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionFinanceAccountOptionModel,
  ConstructionFinanceAccountParamsModel,
  ConstructionFinanceAccountResponseModel,
  ConstructionFinanceAccountStatementLineModel,
  CreateConstructionFinanceAccountRequestModel,
  DeleteConstructionFinanceAccountRequestModel,
  FINANCE_ACCOUNTS_PATH,
  GetConstructionFinanceAccountOptionsRequestModel,
  GetConstructionFinanceAccountOptionsResponseModel,
  GetConstructionFinanceAccountStatementRequestModel,
  GetConstructionFinanceAccountStatementResponseModel,
  ListConstructionFinanceAccountsResponseModel,
  UpdateConstructionFinanceAccountRequestModel,
} from "./account-models";

const TAGS = ["Construction · Finance"];
const READ = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE = [...READ, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED];
const ITEM = `${FINANCE_ACCOUNTS_PATH}/{id}`;
const MENU = "masters.bank_accounts";

export const financeAccountOpenApiComponents: OpenApiComponents = {
  ConstructionFinanceAccountOptionModel,
  GetConstructionFinanceAccountOptionsResponseModel,
  CreateConstructionFinanceAccountRequestModel,
  UpdateConstructionFinanceAccountRequestModel,
  DeleteConstructionFinanceAccountRequestModel,
  ConstructionFinanceAccountResponseModel,
  ListConstructionFinanceAccountsResponseModel,
  ConstructionFinanceAccountStatementLineModel,
  GetConstructionFinanceAccountStatementResponseModel,
};

export const financeAccountOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${FINANCE_ACCOUNTS_PATH}/options`,
    summary: "Accounts the caller may pay from, for the account picker (M7)",
    tags: TAGS,
    query: GetConstructionFinanceAccountOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Usable accounts, primary first",
    successSchema: GetConstructionFinanceAccountOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: FINANCE_ACCOUNTS_PATH,
    summary: `Company's Bank A/C: Cash and Bank accounts with balance and pending documents (${MENU}, read)`,
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Company accounts, primary first",
    successSchema: ListConstructionFinanceAccountsResponseModel,
    errors: READ,
  },
  {
    method: "post",
    path: FINANCE_ACCOUNTS_PATH,
    summary: `Add a Cash or Bank account with its opening balance (${MENU}, create)`,
    tags: TAGS,
    body: CreateConstructionFinanceAccountRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The account",
    successSchema: ConstructionFinanceAccountResponseModel,
    errors: WRITE,
  },
  {
    method: "get",
    path: ITEM,
    summary: `One company account (${MENU}, read)`,
    tags: TAGS,
    params: ConstructionFinanceAccountParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The account",
    successSchema: ConstructionFinanceAccountResponseModel,
    errors: READ,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: `Edit a company account; a changed opening posts a reversal and a new entry (${MENU}, update)`,
    tags: TAGS,
    params: ConstructionFinanceAccountParamsModel,
    body: UpdateConstructionFinanceAccountRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The account",
    successSchema: ConstructionFinanceAccountResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: `${ITEM}/set-primary`,
    summary: `Set As Primary: the default paid-from account (${MENU}, update)`,
    tags: TAGS,
    params: ConstructionFinanceAccountParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The account, now primary",
    successSchema: ConstructionFinanceAccountResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: `Delete an unused company account — ACCOUNT_IN_USE / ACCOUNT_PRIMARY 409 (${MENU}, delete)`,
    tags: TAGS,
    params: ConstructionFinanceAccountParamsModel,
    body: DeleteConstructionFinanceAccountRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE,
  },
  {
    method: "get",
    path: `${ITEM}/statement`,
    summary:
      "An account's statement (Ledger) for a period: opening, entries with running balance, in, out, closing (company: masters.bank_accounts or finance.transactions read; petty cash: its holder or Petty Cash View all)",
    tags: TAGS,
    params: ConstructionFinanceAccountParamsModel,
    query: GetConstructionFinanceAccountStatementRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The statement",
    successSchema: GetConstructionFinanceAccountStatementResponseModel,
    errors: READ,
  },
];
