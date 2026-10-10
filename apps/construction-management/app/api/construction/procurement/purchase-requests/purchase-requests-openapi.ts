import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BulkApproveConstructionProcurementPurchaseRequestsRequestModel,
  BulkDecideConstructionProcurementPurchaseRequestsResponseModel,
  BulkRejectConstructionProcurementPurchaseRequestsRequestModel,
  ConstructionProcurementPurchaseRequestActionsResponseModel,
  ConstructionProcurementPurchaseRequestItemResponseModel,
  ConstructionProcurementPurchaseRequestParamsModel,
  ConstructionProcurementPurchaseRequestResponseModel,
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
  CreateConstructionProcurementPurchaseRequestRequestModel,
  DecideConstructionProcurementPurchaseRequestRequestModel,
  DeleteConstructionProcurementPurchaseRequestRequestModel,
  GetConstructionProcurementPurchaseRequestPdfRequestModel,
  GetConstructionProcurementPurchaseRequestQuantityInfoRequestModel,
  GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel,
  GetConstructionProcurementPurchaseRequestResponseModel,
  ListConstructionProcurementPurchaseRequestsRequestModel,
  ListConstructionProcurementPurchaseRequestsResponseModel,
  PURCHASE_REQUESTS_PATH,
  RejectConstructionProcurementPurchaseRequestRequestModel,
  UpdateConstructionProcurementPurchaseRequestRequestModel,
} from "./purchase-request-models";

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

const ITEM = `${PURCHASE_REQUESTS_PATH}/{id}`;

/** Request and Response models of `/api/construction/procurement/purchase-requests` (M5). */
export const purchaseRequestOpenApiComponents: OpenApiComponents = {
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
  CreateConstructionProcurementPurchaseRequestRequestModel,
  UpdateConstructionProcurementPurchaseRequestRequestModel,
  DeleteConstructionProcurementPurchaseRequestRequestModel,
  DecideConstructionProcurementPurchaseRequestRequestModel,
  RejectConstructionProcurementPurchaseRequestRequestModel,
  BulkApproveConstructionProcurementPurchaseRequestsRequestModel,
  BulkRejectConstructionProcurementPurchaseRequestsRequestModel,
  ConstructionProcurementPurchaseRequestItemResponseModel,
  ConstructionProcurementPurchaseRequestActionsResponseModel,
  ConstructionProcurementPurchaseRequestResponseModel,
  GetConstructionProcurementPurchaseRequestResponseModel,
  ListConstructionProcurementPurchaseRequestsResponseModel,
  BulkDecideConstructionProcurementPurchaseRequestsResponseModel,
  GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel,
};

/**
 * Purchase Request routes (CM-503), menu `procurement.purchase_requests`
 * on the request's Project: read, create, update (edit; Mark as Ordered
 * with update or Approve), delete, approve, reject, print (PDF).
 */
export const purchaseRequestOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: PURCHASE_REQUESTS_PATH,
    summary:
      "A Project's Purchase Requests, newest first, with filters and their options",
    tags: TAGS,
    query: ListConstructionProcurementPurchaseRequestsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Purchase Requests",
    successSchema: ListConstructionProcurementPurchaseRequestsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: PURCHASE_REQUESTS_PATH,
    summary: "Raise a Purchase Request: Save, or Save & Approve with Approve",
    tags: TAGS,
    body: CreateConstructionProcurementPurchaseRequestRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Purchase Request",
    successSchema: GetConstructionProcurementPurchaseRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PURCHASE_REQUESTS_PATH}/quantity-info`,
    summary:
      "Available Stock and Balanced estimated qty per material at a Project",
    tags: TAGS,
    query: GetConstructionProcurementPurchaseRequestQuantityInfoRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Quantities per material",
    successSchema:
      GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${PURCHASE_REQUESTS_PATH}/bulk-approve`,
    summary:
      "Approve several pending Purchase Requests of a Project (all or none)",
    tags: TAGS,
    body: BulkApproveConstructionProcurementPurchaseRequestsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were approved",
    successSchema:
      BulkDecideConstructionProcurementPurchaseRequestsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PURCHASE_REQUESTS_PATH}/bulk-reject`,
    summary:
      "Reject several pending Purchase Requests of a Project (all or none)",
    tags: TAGS,
    body: BulkRejectConstructionProcurementPurchaseRequestsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were rejected",
    successSchema:
      BulkDecideConstructionProcurementPurchaseRequestsResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Purchase Request with its lines and linked Purchase Orders",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Purchase Request",
    successSchema: GetConstructionProcurementPurchaseRequestResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a pending or rejected Purchase Request (a rejected one goes back to pending)",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    body: UpdateConstructionProcurementPurchaseRequestRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The edited Purchase Request",
    successSchema: GetConstructionProcurementPurchaseRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Purchase Request (refused once a Purchase Order line points at it)",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    body: DeleteConstructionProcurementPurchaseRequestRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary: "Approve a pending Purchase Request",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    body: DecideConstructionProcurementPurchaseRequestRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The approved Purchase Request",
    successSchema: GetConstructionProcurementPurchaseRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary: "Reject a pending Purchase Request with a reason",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    body: RejectConstructionProcurementPurchaseRequestRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The rejected Purchase Request",
    successSchema: GetConstructionProcurementPurchaseRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/mark-ordered`,
    summary:
      "Mark an approved or partially ordered Purchase Request as ordered outside the app",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    body: DecideConstructionProcurementPurchaseRequestRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The ordered Purchase Request",
    successSchema: GetConstructionProcurementPurchaseRequestResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/pdf`,
    summary: "The Purchase Request as a PDF (Print)",
    tags: TAGS,
    params: ConstructionProcurementPurchaseRequestParamsModel,
    query: GetConstructionProcurementPurchaseRequestPdfRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];
