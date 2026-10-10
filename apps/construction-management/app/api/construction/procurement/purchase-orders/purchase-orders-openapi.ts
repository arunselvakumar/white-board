import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BulkApproveConstructionProcurementPurchaseOrdersRequestModel,
  BulkDecideConstructionProcurementPurchaseOrdersResponseModel,
  BulkRejectConstructionProcurementPurchaseOrdersRequestModel,
  CloseConstructionProcurementPurchaseOrderRequestModel,
  ConstructionProcurementPurchaseOrderActionsResponseModel,
  ConstructionProcurementPurchaseOrderItemResponseModel,
  ConstructionProcurementPurchaseOrderParamsModel,
  ConstructionProcurementPurchaseOrderResponseModel,
  CreateConstructionProcurementPurchaseOrderRequestModel,
  DecideConstructionProcurementPurchaseOrderRequestModel,
  DeleteConstructionProcurementPurchaseOrderRequestModel,
  GetConstructionProcurementPurchaseOrderFormOptionsRequestModel,
  GetConstructionProcurementPurchaseOrderFormOptionsResponseModel,
  GetConstructionProcurementPurchaseOrderPdfRequestModel,
  GetConstructionProcurementPurchaseOrderResponseModel,
  ListConstructionProcurementPurchaseOrdersRequestModel,
  ListConstructionProcurementPurchaseOrdersResponseModel,
  PURCHASE_ORDERS_PATH,
  RejectConstructionProcurementPurchaseOrderRequestModel,
  UpdateConstructionProcurementPurchaseOrderRequestModel,
} from "./purchase-order-models";

const TAGS = ["Construction · Procurement"];

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

const ITEM = `${PURCHASE_ORDERS_PATH}/{id}`;

/** Request and Response models of `/api/construction/procurement/purchase-orders` (M5). */
export const purchaseOrderOpenApiComponents: OpenApiComponents = {
  CreateConstructionProcurementPurchaseOrderRequestModel,
  UpdateConstructionProcurementPurchaseOrderRequestModel,
  DeleteConstructionProcurementPurchaseOrderRequestModel,
  DecideConstructionProcurementPurchaseOrderRequestModel,
  RejectConstructionProcurementPurchaseOrderRequestModel,
  CloseConstructionProcurementPurchaseOrderRequestModel,
  BulkApproveConstructionProcurementPurchaseOrdersRequestModel,
  BulkRejectConstructionProcurementPurchaseOrdersRequestModel,
  ConstructionProcurementPurchaseOrderItemResponseModel,
  ConstructionProcurementPurchaseOrderActionsResponseModel,
  ConstructionProcurementPurchaseOrderResponseModel,
  GetConstructionProcurementPurchaseOrderResponseModel,
  ListConstructionProcurementPurchaseOrdersResponseModel,
  BulkDecideConstructionProcurementPurchaseOrdersResponseModel,
  GetConstructionProcurementPurchaseOrderFormOptionsResponseModel,
};

type Op = Omit<OpenApiOperation, "tags">;

const operations: Op[] = [
  {
    method: "get",
    path: PURCHASE_ORDERS_PATH,
    summary:
      "A Project's or Store's Purchase Orders, newest first (amounts always shown: no Financial flag)",
    query: ListConstructionProcurementPurchaseOrdersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Purchase Orders",
    successSchema: ListConstructionProcurementPurchaseOrdersResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: PURCHASE_ORDERS_PATH,
    summary:
      "Raise a Purchase Order for a Project or Store (server prices lines and totals)",
    body: CreateConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PURCHASE_ORDERS_PATH}/form-options`,
    summary:
      "Suppliers, billing addresses, T&C and orderable Purchase Requests for the PO form",
    query: GetConstructionProcurementPurchaseOrderFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema:
      GetConstructionProcurementPurchaseOrderFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${PURCHASE_ORDERS_PATH}/bulk-approve`,
    summary: "Approve several pending Purchase Orders (all or none)",
    body: BulkApproveConstructionProcurementPurchaseOrdersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were approved",
    successSchema: BulkDecideConstructionProcurementPurchaseOrdersResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PURCHASE_ORDERS_PATH}/bulk-reject`,
    summary: "Reject several pending Purchase Orders (all or none)",
    body: BulkRejectConstructionProcurementPurchaseOrdersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were rejected",
    successSchema: BulkDecideConstructionProcurementPurchaseOrdersResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Purchase Order with lines, totals and linked Goods Receipts",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a Purchase Order that is not ordered (an approved one goes back to pending)",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    body: UpdateConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The edited Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Purchase Order (refused once a Goods Receipt points at it)",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    body: DeleteConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary: "Approve a pending Purchase Order",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    body: DecideConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The approved Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary: "Reject a pending Purchase Order with a reason",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    body: RejectConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The rejected Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/mark-ordered`,
    summary: "Mark an approved Purchase Order as sent to the supplier",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    body: DecideConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The ordered Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/close`,
    summary: "Close an ordered, short-supplied Purchase Order with a reason",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    body: CloseConstructionProcurementPurchaseOrderRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The closed Purchase Order",
    successSchema: GetConstructionProcurementPurchaseOrderResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/pdf`,
    summary: "The Purchase Order as a PDF with HSN and the GST split (Print)",
    params: ConstructionProcurementPurchaseOrderParamsModel,
    query: GetConstructionProcurementPurchaseOrderPdfRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];

/**
 * Purchase Order routes (CM-504), menu `procurement.purchase_orders` on
 * the PO's Project (a Store PO checks the flag without a Project). The
 * menu has no Financial flag: amounts are shown to every PO reader.
 */
export const purchaseOrderOpenApiOperations: OpenApiOperation[] =
  operations.map((operation) => ({ ...operation, tags: TAGS }));
