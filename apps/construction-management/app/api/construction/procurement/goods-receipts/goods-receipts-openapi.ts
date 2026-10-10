import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionProcurementGoodsReceiptLineResponseModel,
  ConstructionProcurementGoodsReceiptListItemResponseModel,
  ConstructionProcurementGoodsReceiptParamsModel,
  ConstructionProcurementGoodsReceiptResponseModel,
  ConstructionProcurementReceivableOrderResponseModel,
  DeleteConstructionProcurementGoodsReceiptRequestModel,
  GetConstructionProcurementGoodsReceiptFormOptionsRequestModel,
  GetConstructionProcurementGoodsReceiptFormOptionsResponseModel,
  GOODS_RECEIPTS_PATH,
  ListConstructionProcurementGoodsReceiptsRequestModel,
  ListConstructionProcurementGoodsReceiptsResponseModel,
  PostConstructionProcurementGoodsReceiptRequestModel,
  UpdateConstructionProcurementGoodsReceiptRequestModel,
} from "./goods-receipt-models";

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

const ITEM = `${GOODS_RECEIPTS_PATH}/{id}`;

/** Request and Response models of `/api/construction/procurement/goods-receipts` (M5). */
export const goodsReceiptOpenApiComponents: OpenApiComponents = {
  PostConstructionProcurementGoodsReceiptRequestModel,
  UpdateConstructionProcurementGoodsReceiptRequestModel,
  DeleteConstructionProcurementGoodsReceiptRequestModel,
  ConstructionProcurementGoodsReceiptLineResponseModel,
  ConstructionProcurementGoodsReceiptResponseModel,
  ConstructionProcurementGoodsReceiptListItemResponseModel,
  ListConstructionProcurementGoodsReceiptsResponseModel,
  ConstructionProcurementReceivableOrderResponseModel,
  GetConstructionProcurementGoodsReceiptFormOptionsResponseModel,
};

/**
 * Operations of `/api/construction/procurement/goods-receipts` (CM-505).
 * Menu `procurement.material_received` on the Project (a Store at Company
 * level): list and detail = read, post = create, edit = update, delete =
 * delete, PDF = print; View All shows other members' GRNs; Financial shows
 * rates, amounts and the invoice amount.
 */
export const goodsReceiptOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: GOODS_RECEIPTS_PATH,
    summary:
      "Goods Receipts of a Project or Store, newest first, by GR Date, supplier, PO / without PO and number, invoice or challan search (values null without Financial)",
    tags: TAGS,
    query: ListConstructionProcurementGoodsReceiptsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Goods Receipts",
    successSchema: ListConstructionProcurementGoodsReceiptsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: GOODS_RECEIPTS_PATH,
    summary:
      "Post a Goods Receipt against a PO or without one: Received ledger entries on the Inventory Date, the PO's receipt status follows (SUPPLIER_NOT_ON_LOCATION, PURCHASE_ORDER_OTHER_SUPPLIER, GOODS_RECEIPT_LINE_NOT_ON_ORDER, INVENTORY_DATE_BEFORE_RECEIPT 400; PURCHASE_ORDER_NOT_APPROVED / _CLOSED / _RECEIVED 409; back-dated 403)",
    tags: TAGS,
    body: PostConstructionProcurementGoodsReceiptRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The posted Goods Receipt",
    successSchema: ConstructionProcurementGoodsReceiptResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${GOODS_RECEIPTS_PATH}/form-options`,
    summary:
      "Suppliers, receivable POs (ordered and received per line) and hidden GRN fields for the GRN form (create or update)",
    tags: TAGS,
    query: GetConstructionProcurementGoodsReceiptFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Form options",
    successSchema: GetConstructionProcurementGoodsReceiptFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary:
      "One Goods Receipt with ordered, already received and excess per PO line",
    tags: TAGS,
    params: ConstructionProcurementGoodsReceiptParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Goods Receipt",
    successSchema: ConstructionProcurementGoodsReceiptResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit a Goods Receipt: its ledger entries are reversed and posted again (STOCK_INSUFFICIENT 409 when its stock has gone out; GOODS_RECEIPT_CHANGED, GOODS_RECEIPT_PAID 409; back-dated edit 403)",
    tags: TAGS,
    params: ConstructionProcurementGoodsReceiptParamsModel,
    body: UpdateConstructionProcurementGoodsReceiptRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The edited Goods Receipt",
    successSchema: ConstructionProcurementGoodsReceiptResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Goods Receipt: tombstone and ledger reversal (STOCK_INSUFFICIENT, GOODS_RECEIPT_CHANGED, GOODS_RECEIPT_PAID 409)",
    tags: TAGS,
    params: ConstructionProcurementGoodsReceiptParamsModel,
    body: DeleteConstructionProcurementGoodsReceiptRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/pdf`,
    summary:
      "The GRN PDF (print): amounts only with Financial, hidden fields left out",
    tags: TAGS,
    params: ConstructionProcurementGoodsReceiptParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];
