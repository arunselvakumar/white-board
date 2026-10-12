import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ApproveConstructionFinanceOtherExpenseRequestModel,
  BulkApproveConstructionFinanceOtherExpensesRequestModel,
  BulkDecideConstructionFinanceOtherExpensesResponseModel,
  BulkRejectConstructionFinanceOtherExpensesRequestModel,
  ConstructionFinanceOtherExpenseParamsModel,
  ConstructionFinanceOtherExpenseResponseModel,
  CreateConstructionFinanceOtherExpenseRequestModel,
  DeleteConstructionFinanceOtherExpenseRequestModel,
  ListConstructionFinanceOtherExpensesRequestModel,
  ListConstructionFinanceOtherExpensesResponseModel,
  OTHER_EXPENSES_PATH,
  RejectConstructionFinanceOtherExpenseRequestModel,
  UpdateConstructionFinanceOtherExpenseRequestModel,
} from "./other-expense-models";

const TAGS = ["Construction · Finance"];

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

const ITEM = `${OTHER_EXPENSES_PATH}/{id}`;

/** Other Expense models (CM-704). */
export const financeOtherExpenseOpenApiComponents: OpenApiComponents = {
  CreateConstructionFinanceOtherExpenseRequestModel,
  UpdateConstructionFinanceOtherExpenseRequestModel,
  DeleteConstructionFinanceOtherExpenseRequestModel,
  ApproveConstructionFinanceOtherExpenseRequestModel,
  RejectConstructionFinanceOtherExpenseRequestModel,
  BulkApproveConstructionFinanceOtherExpensesRequestModel,
  BulkRejectConstructionFinanceOtherExpensesRequestModel,
  BulkDecideConstructionFinanceOtherExpensesResponseModel,
  ConstructionFinanceOtherExpenseResponseModel,
  ListConstructionFinanceOtherExpensesResponseModel,
};

/**
 * Other Expenses of a Project, menu `finance.other_expenses` (C R U D A J
 * P O) on the expense's Project. Approval posts the account entry.
 */
export const financeOtherExpenseOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: OTHER_EXPENSES_PATH,
    summary:
      "A Project's Other Expenses, newest first, by date range, Payment Category, account and status, with totals (CM-704)",
    tags: TAGS,
    query: ListConstructionFinanceOtherExpensesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Other Expenses",
    successSchema: ListConstructionFinanceOtherExpensesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: OTHER_EXPENSES_PATH,
    summary:
      "Record an Other Expense (EXP number), pending or Save & Approve (ACCOUNT_MODE_MISMATCH, CHEQUE_NUMBER_REQUIRED, REFERENCE_REQUIRED, PAYMENT_CATEGORY_NOT_FOUND, EXPENSE_DATE_IN_FUTURE 400; ACCOUNT_NOT_YOURS, back-dated 403; ACCOUNT_NOT_FOUND 404)",
    tags: TAGS,
    body: CreateConstructionFinanceOtherExpenseRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Other Expense",
    successSchema: ConstructionFinanceOtherExpenseResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One live Other Expense",
    tags: TAGS,
    params: ConstructionFinanceOtherExpenseParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Other Expense",
    successSchema: ConstructionFinanceOtherExpenseResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit an Other Expense: an approved one is reversed and returns to pending, a rejected one returns to pending (OTHER_EXPENSE_CHANGED 409; back-dated or closed period 403)",
    tags: TAGS,
    params: ConstructionFinanceOtherExpenseParamsModel,
    body: UpdateConstructionFinanceOtherExpenseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Other Expense",
    successSchema: ConstructionFinanceOtherExpenseResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete an Other Expense; an approved one has its account entry reversed (closed period 403)",
    tags: TAGS,
    params: ConstructionFinanceOtherExpenseParamsModel,
    body: DeleteConstructionFinanceOtherExpenseRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary:
      "Approve a pending Other Expense, posting its account entry (OTHER_EXPENSE_NOT_PENDING 409; FINANCIAL_PERIOD_CLOSED 403)",
    tags: TAGS,
    params: ConstructionFinanceOtherExpenseParamsModel,
    body: ApproveConstructionFinanceOtherExpenseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Other Expense",
    successSchema: ConstructionFinanceOtherExpenseResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary:
      "Reject a pending Other Expense with a reason (REJECTION_REASON_REQUIRED 400; OTHER_EXPENSE_NOT_PENDING 409)",
    tags: TAGS,
    params: ConstructionFinanceOtherExpenseParamsModel,
    body: RejectConstructionFinanceOtherExpenseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Other Expense",
    successSchema: ConstructionFinanceOtherExpenseResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${OTHER_EXPENSES_PATH}/bulk-approve`,
    summary:
      "Approve several Other Expenses of one Project, all or none (BULK_DECISION_REFUSED 409)",
    tags: TAGS,
    body: BulkApproveConstructionFinanceOtherExpensesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were approved",
    successSchema: BulkDecideConstructionFinanceOtherExpensesResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${OTHER_EXPENSES_PATH}/bulk-reject`,
    summary:
      "Reject several Other Expenses of one Project with one reason, all or none (BULK_DECISION_REFUSED 409)",
    tags: TAGS,
    body: BulkRejectConstructionFinanceOtherExpensesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were rejected",
    successSchema: BulkDecideConstructionFinanceOtherExpensesResponseModel,
    errors: WRITE_ERRORS,
  },
];
