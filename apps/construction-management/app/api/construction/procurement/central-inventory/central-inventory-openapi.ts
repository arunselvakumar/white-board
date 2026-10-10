import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { PROCUREMENT_TAGS, READ_ERRORS } from "../stores/stores-openapi";
import {
  CENTRAL_INVENTORY_PATH,
  GetConstructionProcurementCentralInventoryRequestModel,
  GetConstructionProcurementCentralInventoryResponseModel,
  GetConstructionProcurementStockLedgerRequestModel,
  GetConstructionProcurementStockLedgerResponseModel,
} from "./central-inventory-models";

/** Request and Response models of `/api/construction/procurement/central-inventory` (M5). */
export const centralInventoryOpenApiComponents: OpenApiComponents = {
  GetConstructionProcurementCentralInventoryResponseModel,
  GetConstructionProcurementStockLedgerResponseModel,
};

/** Operations of `/api/construction/procurement/central-inventory` (CM-509; menu `procurement.central_inventory`). */
export const centralInventoryOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: CENTRAL_INVENTORY_PATH,
    summary:
      "Stock per material at every Project and Store with in-transit quantities, by location, category and stock state (read)",
    tags: PROCUREMENT_TAGS,
    query: GetConstructionProcurementCentralInventoryRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Central Inventory",
    successSchema: GetConstructionProcurementCentralInventoryResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${CENTRAL_INVENTORY_PATH}/stock-ledger`,
    summary:
      "The Stock Ledger for a period and locations: opening, movements by type, closing (read)",
    tags: PROCUREMENT_TAGS,
    query: GetConstructionProcurementStockLedgerRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Ledger rows",
    successSchema: GetConstructionProcurementStockLedgerResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${CENTRAL_INVENTORY_PATH}/stock-ledger/xlsx`,
    summary: "The Stock Ledger as an Excel file, generated on request (print)",
    tags: PROCUREMENT_TAGS,
    query: GetConstructionProcurementStockLedgerRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The workbook",
    successBinaryContentTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    errors: READ_ERRORS,
  },
];
