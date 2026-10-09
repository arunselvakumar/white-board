import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { DOCUMENT_CONTENT_TYPES } from "@/src/shared-kernel/files/document-file";

import {
  BALANCES_PATH,
  ConstructionLabourBalanceRowResponseModel,
  ConstructionLabourPeriodSummaryResponseModel,
  ConstructionLabourStatementLineResponseModel,
  GetConstructionLabourBalancesRequestModel,
  GetConstructionLabourBalancesResponseModel,
  GetConstructionLabourStatementRequestModel,
  GetConstructionLabourStatementResponseModel,
} from "../balances/balance-models";
import {
  CancelConstructionLabourWagePaymentRequestModel,
  ConstructionLabourWagePaymentParamsModel,
  ConstructionLabourWagePaymentResponseModel,
  ListConstructionLabourPaymentPayersRequestModel,
  ListConstructionLabourPaymentPayersResponseModel,
  ListConstructionLabourWagePaymentsRequestModel,
  ListConstructionLabourWagePaymentsResponseModel,
  PAYMENTS_PATH,
  RecordConstructionLabourWagePaymentRequestModel,
} from "./payment-models";

const LABOUR = ["Construction · Labour"];

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

const ITEM = `${PAYMENTS_PATH}/{id}`;

/** Wage payment and balance models (CM-214, CM-215). */
export const paymentOpenApiComponents: OpenApiComponents = {
  RecordConstructionLabourWagePaymentRequestModel,
  CancelConstructionLabourWagePaymentRequestModel,
  ConstructionLabourWagePaymentResponseModel,
  ListConstructionLabourWagePaymentsResponseModel,
  ListConstructionLabourPaymentPayersResponseModel,
  ConstructionLabourPeriodSummaryResponseModel,
  ConstructionLabourBalanceRowResponseModel,
  GetConstructionLabourBalancesResponseModel,
  ConstructionLabourStatementLineResponseModel,
  GetConstructionLabourStatementResponseModel,
};

/**
 * Wage payment and balance routes. Labour parties are under menu
 * `labour.labour`, vendors under `labour.vendor`, on the Project; record =
 * create, cancel = delete, reads = read; amounts need Financial.
 */
export const paymentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PAYMENTS_PATH,
    summary:
      "Recorded payments of a Project, newest recorded first, by party type, party, kind and payment date (amounts null without Financial)",
    tags: LABOUR,
    query: ListConstructionLabourWagePaymentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of payments",
    successSchema: ListConstructionLabourWagePaymentsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: PAYMENTS_PATH,
    summary:
      "Record a payment or advance to a Labour or vendor, posting one negative ledger entry (PAYMENT_AMOUNT_INVALID, VENDOR_NOT_ON_PROJECT, PAYMENT_DATE_IN_FUTURE, TEAM_MEMBER_NOT_FOUND 400; party or Project 404; back-dated 403)",
    tags: LABOUR,
    body: RecordConstructionLabourWagePaymentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The recorded payment",
    successSchema: ConstructionLabourWagePaymentResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PAYMENTS_PATH}/payers`,
    summary:
      "Team Members for “Paid by” on the pay dialog, and the caller's own",
    tags: LABOUR,
    query: ListConstructionLabourPaymentPayersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Active Team Members",
    successSchema: ListConstructionLabourPaymentPayersResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One live payment",
    tags: LABOUR,
    params: ConstructionLabourWagePaymentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The payment",
    successSchema: ConstructionLabourWagePaymentResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/cancel`,
    summary:
      "Cancel a payment: tombstone and ledger reversal; there is no edit, cancel and record again (PAYMENT_CHANGED 409; back-dated edit limit 403)",
    tags: LABOUR,
    params: ConstructionLabourWagePaymentParamsModel,
    body: CancelConstructionLabourWagePaymentRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Cancelled",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/receipt`,
    summary: "The payment's receipt",
    tags: LABOUR,
    params: ConstructionLabourWagePaymentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: [...DOCUMENT_CONTENT_TYPES],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/receipt`,
    summary:
      "Set or replace the payment's receipt (the PDF or image as the body, ≤ 10 MB; needs create)",
    tags: LABOUR,
    params: ConstructionLabourWagePaymentParamsModel,
    bodyBinaryContentTypes: [...DOCUMENT_CONTENT_TYPES],
    successStatus: StatusCodes.OK,
    successDescription: "The payment with its receipt URL",
    successSchema: ConstructionLabourWagePaymentResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/receipt/remove`,
    summary: "Remove the payment's receipt (needs delete)",
    tags: LABOUR,
    params: ConstructionLabourWagePaymentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The payment without a receipt",
    successSchema: ConstructionLabourWagePaymentResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: BALANCES_PATH,
    summary:
      "Previous Balance, To Pay, Advance, Paid and Final Amount per Labour or vendor of a Project for a monthly, weekly or custom period (party-wide figures; null without Financial)",
    tags: LABOUR,
    query: GetConstructionLabourBalancesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Period summaries and totals",
    successSchema: GetConstructionLabourBalancesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BALANCES_PATH}/statement`,
    summary:
      "One party's ledger between two dates with the running balance, Project and source of each entry",
    tags: LABOUR,
    query: GetConstructionLabourStatementRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The statement",
    successSchema: GetConstructionLabourStatementResponseModel,
    errors: READ_ERRORS,
  },
];
