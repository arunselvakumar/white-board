import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AmendConstructionContractsWorkOrderRequestModel,
  CancelConstructionContractsWorkOrderRequestModel,
  CloseConstructionContractsWorkOrderRequestModel,
  ConstructionContractsWorkOrderFormOptionsResponseModel,
  ConstructionContractsWorkOrderParamsModel,
  ConstructionContractsWorkOrderProjectQueryModel,
  ConstructionContractsWorkOrderStepRequestModel,
  ConstructionContractsWorkOrderSummaryModel,
  CreateConstructionContractsWorkOrderRequestModel,
  GetConstructionContractsWorkOrderResponseModel,
  ListConstructionContractsWorkOrderBoqItemsRequestModel,
  ListConstructionContractsWorkOrderBoqItemsResponseModel,
  ListConstructionContractsWorkOrderMaterialOptionsRequestModel,
  ListConstructionContractsWorkOrderMaterialOptionsResponseModel,
  ListConstructionContractsWorkOrdersRequestModel,
  ListConstructionContractsWorkOrdersResponseModel,
  RejectConstructionContractsWorkOrderRequestModel,
  UpdateConstructionContractsWorkOrderRequestModel,
  WORK_ORDERS_PATH,
} from "./work-order-models";
import {
  ConstructionContractsWorkOrderReconciliationResponseModel,
  GetConstructionContractsWorkOrderReconciliationRequestModel,
} from "./reconciliation-models";

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

const ONE = `${WORK_ORDERS_PATH}/{id}`;

/** The Work Orders' models (CM-1104). */
export const contractsWorkOrdersOpenApiComponents: OpenApiComponents = {
  ConstructionContractsWorkOrderSummaryModel,
  ListConstructionContractsWorkOrdersResponseModel,
  GetConstructionContractsWorkOrderResponseModel,
  CreateConstructionContractsWorkOrderRequestModel,
  UpdateConstructionContractsWorkOrderRequestModel,
  AmendConstructionContractsWorkOrderRequestModel,
  ConstructionContractsWorkOrderStepRequestModel,
  RejectConstructionContractsWorkOrderRequestModel,
  CloseConstructionContractsWorkOrderRequestModel,
  CancelConstructionContractsWorkOrderRequestModel,
  ConstructionContractsWorkOrderFormOptionsResponseModel,
  ListConstructionContractsWorkOrderBoqItemsResponseModel,
  ListConstructionContractsWorkOrderMaterialOptionsResponseModel,
  ConstructionContractsWorkOrderReconciliationResponseModel,
};

function step(
  name: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `${ONE}/${name}`,
    summary,
    tags: TAGS,
    params: ConstructionContractsWorkOrderParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The Work Order",
    successSchema: GetConstructionContractsWorkOrderResponseModel,
    errors: WRITE_ERRORS,
  };
}

/** Every Work Order operation (CM-1104). */
export const contractsWorkOrdersOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: WORK_ORDERS_PATH,
    summary:
      "The Project's Work Orders, newest first, by status, Contractor or number/scope",
    tags: TAGS,
    query: ListConstructionContractsWorkOrdersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Work Orders",
    successSchema: ListConstructionContractsWorkOrdersResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: WORK_ORDERS_PATH,
    summary:
      "Draft a Work Order to a Contractor on the Project; lines over the BOQ's remaining quantity come back as warnings",
    tags: TAGS,
    body: CreateConstructionContractsWorkOrderRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Work Order",
    successSchema: GetConstructionContractsWorkOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${WORK_ORDERS_PATH}/form-options`,
    summary:
      "Contractors on the Project, UoMs, TDS natures, SAC codes and GST rates for the form",
    tags: TAGS,
    query: ConstructionContractsWorkOrderProjectQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The pickers",
    successSchema: ConstructionContractsWorkOrderFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${WORK_ORDERS_PATH}/boq-items`,
    summary:
      "The BOQ's items with what each has left after other Work Orders, for Add from BOQ",
    tags: TAGS,
    query: ListConstructionContractsWorkOrderBoqItemsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "BOQ items",
    successSchema: ListConstructionContractsWorkOrderBoqItemsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${WORK_ORDERS_PATH}/material-options`,
    summary: "Enabled Materials for the materials issued, by name",
    tags: TAGS,
    query: ListConstructionContractsWorkOrderMaterialOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Materials",
    successSchema:
      ListConstructionContractsWorkOrderMaterialOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ONE,
    summary: "One Work Order with its lines, materials, revisions and warnings",
    tags: TAGS,
    params: ConstructionContractsWorkOrderParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Work Order",
    successSchema: GetConstructionContractsWorkOrderResponseModel,
    errors: READ_ERRORS,
  },
  step(
    "update",
    "Save a draft Work Order (WORK_ORDER_STATUS_INVALID, WORK_ORDER_CHANGED 409)",
    UpdateConstructionContractsWorkOrderRequestModel,
  ),
  {
    method: "post",
    path: `${ONE}/delete`,
    summary: "Delete a draft Work Order (WORK_ORDER_STATUS_INVALID 409)",
    tags: TAGS,
    params: ConstructionContractsWorkOrderParamsModel,
    body: ConstructionContractsWorkOrderStepRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  step(
    "submit",
    "Send a draft for approval; the first submission takes its number",
    ConstructionContractsWorkOrderStepRequestModel,
  ),
  step(
    "approve",
    "Approve and issue a pending Work Order (Approve; WORK_ORDER_NOT_PENDING 409)",
    ConstructionContractsWorkOrderStepRequestModel,
  ),
  step(
    "reject",
    "Reject a pending Work Order back to draft with a reason (Reject)",
    RejectConstructionContractsWorkOrderRequestModel,
  ),
  step(
    "amend",
    "Amend an issued Work Order as a new revision (Update and Approve; WORK_ORDER_LINE_BILLED, WORK_ORDER_QUANTITY_BELOW_BILLED 409)",
    AmendConstructionContractsWorkOrderRequestModel,
  ),
  step(
    "close",
    "Close an issued Work Order with a date and reason (WORK_ORDER_BILL_OPEN 409)",
    CloseConstructionContractsWorkOrderRequestModel,
  ),
  step(
    "cancel",
    "Cancel a draft or issued Work Order with a reason (WORK_ORDER_BILLED, WORK_ORDER_BILL_OPEN 409)",
    CancelConstructionContractsWorkOrderRequestModel,
  ),
  {
    method: "get",
    path: `${ONE}/pdf`,
    summary:
      "The Work Order as a PDF with its lines and terms (Print; quantities only without Financial)",
    tags: TAGS,
    params: ConstructionContractsWorkOrderParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ONE}/reconciliation`,
    summary:
      "The Work Order's material reconciliation statement at a running bill: theoretical, allowed, issued, excess, under-use and recoveries per material, the issues counted and the unattributed ones (Read; money needs Financial; BILL_NOT_FOUND 404)",
    tags: TAGS,
    params: ConstructionContractsWorkOrderParamsModel,
    query: GetConstructionContractsWorkOrderReconciliationRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The statement",
    successSchema: ConstructionContractsWorkOrderReconciliationResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ONE}/reconciliation/pdf`,
    summary:
      "The material reconciliation statement as a PDF (Print; quantities only without Financial)",
    tags: TAGS,
    params: ConstructionContractsWorkOrderParamsModel,
    query: GetConstructionContractsWorkOrderReconciliationRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];
