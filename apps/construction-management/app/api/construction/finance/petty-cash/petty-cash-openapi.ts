import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BulkApproveConstructionFinancePettyCashVouchersRequestModel,
  BulkDecideConstructionFinancePettyCashVouchersResponseModel,
  BulkRejectConstructionFinancePettyCashVouchersRequestModel,
  ConstructionFinancePettyCashAccountParamsModel,
  ConstructionFinancePettyCashAccountResponseModel,
  ConstructionFinancePettyCashVoucherParamsModel,
  ConstructionFinancePettyCashVoucherResponseModel,
  CreateConstructionFinancePettyCashVoucherRequestModel,
  ExportConstructionFinancePettyCashReceiptsQueryModel,
  ListConstructionFinancePettyCashAccountsResponseModel,
  ListConstructionFinancePettyCashVouchersRequestModel,
  ListConstructionFinancePettyCashVouchersResponseModel,
  OpenConstructionFinancePettyCashAccountRequestModel,
  PETTY_CASH_PATH,
  RejectConstructionFinancePettyCashVoucherRequestModel,
  UpdateConstructionFinancePettyCashVoucherRequestModel,
} from "./petty-cash-models";

const TAGS = ["Construction · Finance"];
const ACCOUNTS = `${PETTY_CASH_PATH}/accounts`;
const VOUCHERS = `${PETTY_CASH_PATH}/vouchers`;
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const READ = [StatusCodes.BAD_REQUEST, ...SESSION];
const WRITE = [...READ, StatusCodes.PAYMENT_REQUIRED, StatusCodes.NOT_FOUND];

/** Petty Cash's Request and Response models (CM-703). */
export const pettyCashOpenApiComponents: OpenApiComponents = {
  ListConstructionFinancePettyCashAccountsResponseModel,
  ConstructionFinancePettyCashAccountResponseModel,
  OpenConstructionFinancePettyCashAccountRequestModel,
  ListConstructionFinancePettyCashVouchersResponseModel,
  ConstructionFinancePettyCashVoucherResponseModel,
  CreateConstructionFinancePettyCashVoucherRequestModel,
  UpdateConstructionFinancePettyCashVoucherRequestModel,
  RejectConstructionFinancePettyCashVoucherRequestModel,
  BulkApproveConstructionFinancePettyCashVouchersRequestModel,
  BulkRejectConstructionFinancePettyCashVouchersRequestModel,
  BulkDecideConstructionFinancePettyCashVouchersResponseModel,
};

/**
 * `/api/construction/finance/petty-cash` (CM-703, menu `finance.petty_cash`,
 * ADR CM-0017 §2, §4, §9). The account statement is the accounts'
 * `GET /api/construction/finance/accounts/{id}/statement`.
 */
export const pettyCashOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: ACCOUNTS,
    summary:
      "Petty-cash accounts with holder, balance (approved only), pending total and last voucher date (read); every account with View all, otherwise the caller's own",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Accounts",
    successSchema: ListConstructionFinancePettyCashAccountsResponseModel,
    errors: SESSION,
  },
  {
    method: "post",
    path: ACCOUNTS,
    summary:
      "Open a Team Member's petty-cash account (create): one live account each (409 PETTY_CASH_ACCOUNT_EXISTS), an optional opening balance posts an opening entry",
    tags: TAGS,
    body: OpenConstructionFinancePettyCashAccountRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The account",
    successSchema: ConstructionFinancePettyCashAccountResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${ACCOUNTS}/{id}`,
    summary: "One petty-cash account the caller sees (read; 404 otherwise)",
    tags: TAGS,
    params: ConstructionFinancePettyCashAccountParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The account",
    successSchema: ConstructionFinancePettyCashAccountResponseModel,
    errors: [...READ, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${ACCOUNTS}/{id}/delete`,
    summary:
      "Close a petty-cash account (delete) that has no vouchers and no entries but its opening (409 PETTY_CASH_ACCOUNT_IN_USE)",
    tags: TAGS,
    params: ConstructionFinancePettyCashAccountParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Closed",
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${ACCOUNTS}/{id}/receipts.zip`,
    summary:
      "Export Receipts (print, the matrix's Download): a ZIP of the photos and receipts of the account's vouchers dated from–to, named `<voucher number> <n>.<ext>` with the number's slashes as dashes; 409 TOO_MANY_RECEIPTS above 500 files",
    tags: TAGS,
    params: ConstructionFinancePettyCashAccountParamsModel,
    query: ExportConstructionFinancePettyCashReceiptsQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The ZIP",
    successBinaryContentTypes: ["application/zip"],
    errors: [...READ, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: VOUCHERS,
    summary:
      "Petty-cash vouchers newest first by account, Project, dates, type, status and Payment Category, with totals by type (read, on the Project when given); only accounts and Projects the caller sees",
    tags: TAGS,
    query: ListConstructionFinancePettyCashVouchersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of vouchers",
    successSchema: ListConstructionFinancePettyCashVouchersResponseModel,
    errors: READ,
  },
  {
    method: "post",
    path: VOUCHERS,
    summary:
      "Write a Payment, Receipt or Transfer voucher (create, on its Project when given), numbered PC; `approve` (Save & Approve, needs approve) posts at once. 400 ACCOUNT_NOT_PETTY_CASH, PAYMENT_CATEGORY_REQUIRED, TO_ACCOUNT_*; 403 ACCOUNT_NOT_YOURS, BACKDATED_CREATE_BLOCKED, FINANCIAL_PERIOD_CLOSED",
    tags: TAGS,
    body: CreateConstructionFinancePettyCashVoucherRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The voucher",
    successSchema: ConstructionFinancePettyCashVoucherResponseModel,
    errors: WRITE,
  },
  {
    method: "get",
    path: `${VOUCHERS}/{id}`,
    summary:
      "One voucher with the caller's actions (read; 404 PETTY_CASH_VOUCHER_NOT_FOUND for another holder's voucher without View all)",
    tags: TAGS,
    params: ConstructionFinancePettyCashVoucherParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The voucher",
    successSchema: ConstructionFinancePettyCashVoucherResponseModel,
    errors: [...READ, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${VOUCHERS}/{id}/update`,
    summary:
      "Change a voucher (update): a rejected one is resubmitted, an approved one has its entries reversed; it returns to pending. 409 PETTY_CASH_VOUCHER_CHANGED when stale",
    tags: TAGS,
    params: ConstructionFinancePettyCashVoucherParamsModel,
    body: UpdateConstructionFinancePettyCashVoucherRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The voucher",
    successSchema: ConstructionFinancePettyCashVoucherResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${VOUCHERS}/{id}/approve`,
    summary:
      "Approve a pending voucher (approve) and post its entries: Payment −, Receipt +, Transfer out of its account and into the other. 409 PETTY_CASH_VOUCHER_NOT_PENDING; 403 FINANCIAL_PERIOD_CLOSED",
    tags: TAGS,
    params: ConstructionFinancePettyCashVoucherParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The voucher",
    successSchema: ConstructionFinancePettyCashVoucherResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${VOUCHERS}/{id}/reject`,
    summary:
      "Reject a pending voucher with a reason (reject); it can be edited and resubmitted",
    tags: TAGS,
    params: ConstructionFinancePettyCashVoucherParamsModel,
    body: RejectConstructionFinancePettyCashVoucherRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The voucher",
    successSchema: ConstructionFinancePettyCashVoucherResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${VOUCHERS}/{id}/delete`,
    summary:
      "Delete a voucher (delete); an approved one has its entries reversed first",
    tags: TAGS,
    params: ConstructionFinancePettyCashVoucherParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE,
  },
  {
    method: "post",
    path: `${VOUCHERS}/bulk-approve`,
    summary:
      "Approve several pending vouchers, all or none (approve; 409 BULK_DECISION_REFUSED lists each refusal)",
    tags: TAGS,
    body: BulkApproveConstructionFinancePettyCashVouchersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were approved",
    successSchema: BulkDecideConstructionFinancePettyCashVouchersResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${VOUCHERS}/bulk-reject`,
    summary:
      "Reject several pending vouchers with one reason, all or none (reject)",
    tags: TAGS,
    body: BulkRejectConstructionFinancePettyCashVouchersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were rejected",
    successSchema: BulkDecideConstructionFinancePettyCashVouchersResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
];
