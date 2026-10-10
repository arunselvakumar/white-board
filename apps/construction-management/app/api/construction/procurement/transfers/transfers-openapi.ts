import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ApproveConstructionProcurementMaterialTransferRequestModel,
  ConstructionProcurementMaterialTransferParamsModel,
  ConstructionProcurementMaterialTransferResponseModel,
  CreateConstructionProcurementMaterialTransferRequestModel,
  DeleteConstructionProcurementMaterialTransferRequestModel,
  DeliverConstructionProcurementMaterialTransferRequestModel,
  GetConstructionProcurementTransferStockRequestModel,
  GetConstructionProcurementTransferStockResponseModel,
  ListConstructionProcurementMaterialTransfersRequestModel,
  ListConstructionProcurementMaterialTransfersResponseModel,
  RejectConstructionProcurementMaterialTransferRequestModel,
  TRANSFERS_PATH,
  UpdateConstructionProcurementMaterialTransferRequestModel,
} from "./transfer-models";

const TAGS = ["Construction · Procurement"];

const READ = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE = [...READ, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED];

const ITEM = `${TRANSFERS_PATH}/{id}`;
const MENU =
  "menu `procurement.material_transfers` on the Project side; a Store side also needs `procurement.central_store`";

/** Request and Response models of `/api/construction/procurement/transfers` (M5). */
export const materialTransferOpenApiComponents: OpenApiComponents = {
  CreateConstructionProcurementMaterialTransferRequestModel,
  UpdateConstructionProcurementMaterialTransferRequestModel,
  ApproveConstructionProcurementMaterialTransferRequestModel,
  RejectConstructionProcurementMaterialTransferRequestModel,
  DeliverConstructionProcurementMaterialTransferRequestModel,
  DeleteConstructionProcurementMaterialTransferRequestModel,
  ConstructionProcurementMaterialTransferResponseModel,
  ListConstructionProcurementMaterialTransfersResponseModel,
  GetConstructionProcurementTransferStockResponseModel,
};

/** Operations of `/api/construction/procurement/transfers` (M5). */
export const materialTransferOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: TRANSFERS_PATH,
    summary: `Material Transfers into and out of a Project or Store, newest first (${MENU}, read)`,
    tags: TAGS,
    query: ListConstructionProcurementMaterialTransfersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of transfers",
    successSchema: ListConstructionProcurementMaterialTransfersResponseModel,
    errors: READ,
  },
  {
    method: "post",
    path: TRANSFERS_PATH,
    summary: `Raise a transfer, pending or (approve: true) Save & Approve; TRANSFER_SAME_LOCATION 400, STOCK_INSUFFICIENT 409 (${MENU}, create on the source; approve too for Save & Approve)`,
    tags: TAGS,
    body: CreateConstructionProcurementMaterialTransferRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The transfer",
    successSchema: ConstructionProcurementMaterialTransferResponseModel,
    errors: WRITE,
  },
  {
    method: "get",
    path: `${TRANSFERS_PATH}/available-stock`,
    summary: `Available stock at a transfer's source for the form (${MENU}, create or update on the source)`,
    tags: TAGS,
    query: GetConstructionProcurementTransferStockRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Stock per material",
    successSchema: GetConstructionProcurementTransferStockResponseModel,
    errors: READ,
  },
  {
    method: "get",
    path: ITEM,
    summary: `One transfer with its lines (${MENU}, read on either side)`,
    tags: TAGS,
    params: ConstructionProcurementMaterialTransferParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The transfer",
    successSchema: ConstructionProcurementMaterialTransferResponseModel,
    errors: READ,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: `Edit a pending transfer (MATERIAL_TRANSFER_NOT_PENDING, MATERIAL_TRANSFER_CHANGED 409; ${MENU}, update on the source)`,
    tags: TAGS,
    params: ConstructionProcurementMaterialTransferParamsModel,
    body: UpdateConstructionProcurementMaterialTransferRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The transfer",
    successSchema: ConstructionProcurementMaterialTransferResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary: `Approve and dispatch: Transferred out at the source on the transfer date (STOCK_INSUFFICIENT 409; ${MENU}, approve on the source)`,
    tags: TAGS,
    params: ConstructionProcurementMaterialTransferParamsModel,
    body: ApproveConstructionProcurementMaterialTransferRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The transfer, in transit",
    successSchema: ConstructionProcurementMaterialTransferResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: `${ITEM}/reject`,
    summary: `Reject with a reason; nothing moves (${MENU}, reject on the source)`,
    tags: TAGS,
    params: ConstructionProcurementMaterialTransferParamsModel,
    body: RejectConstructionProcurementMaterialTransferRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The transfer, rejected",
    successSchema: ConstructionProcurementMaterialTransferResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: `${ITEM}/deliver`,
    summary: `Mark as Delivered: Transferred in at the destination on the delivery date (MATERIAL_TRANSFER_NOT_IN_TRANSIT 409; ${MENU}, update on the destination)`,
    tags: TAGS,
    params: ConstructionProcurementMaterialTransferParamsModel,
    body: DeliverConstructionProcurementMaterialTransferRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The transfer, delivered",
    successSchema: ConstructionProcurementMaterialTransferResponseModel,
    errors: WRITE,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: `Delete a pending transfer (${MENU}, delete on the source)`,
    tags: TAGS,
    params: ConstructionProcurementMaterialTransferParamsModel,
    body: DeleteConstructionProcurementMaterialTransferRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE,
  },
];
