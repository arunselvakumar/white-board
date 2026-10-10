import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  accessOpenApiComponents,
  accessOpenApiOperations,
} from "./access/access-openapi";
import {
  centralInventoryOpenApiComponents,
  centralInventoryOpenApiOperations,
} from "./central-inventory/central-inventory-openapi";
import {
  procurementDashboardOpenApiComponents,
  procurementDashboardOpenApiOperations,
} from "./dashboard/dashboard-openapi";
import {
  deliveryNoteOpenApiComponents,
  deliveryNoteOpenApiOperations,
} from "./delivery-notes/delivery-notes-openapi";
import {
  procurementDocumentOpenApiComponents,
  procurementDocumentOpenApiOperations,
} from "./documents/documents-openapi";
import {
  goodsReceiptOpenApiComponents,
  goodsReceiptOpenApiOperations,
} from "./goods-receipts/goods-receipts-openapi";
import {
  inventoryOpenApiComponents,
  inventoryOpenApiOperations,
} from "./inventory/inventory-openapi";
import {
  materialRequestOpenApiComponents,
  materialRequestOpenApiOperations,
} from "./material-requests/material-requests-openapi";
import {
  purchaseOrderOpenApiComponents,
  purchaseOrderOpenApiOperations,
} from "./purchase-orders/purchase-orders-openapi";
import {
  purchaseRequestOpenApiComponents,
  purchaseRequestOpenApiOperations,
} from "./purchase-requests/purchase-requests-openapi";
import {
  storeOpenApiComponents,
  storeOpenApiOperations,
} from "./stores/stores-openapi";
import {
  materialTransferOpenApiComponents,
  materialTransferOpenApiOperations,
} from "./transfers/transfers-openapi";

/** Every procurement model (M5); each area owns its own file. */
export const procurementOpenApiComponents: OpenApiComponents = {
  ...accessOpenApiComponents,
  ...purchaseRequestOpenApiComponents,
  ...purchaseOrderOpenApiComponents,
  ...goodsReceiptOpenApiComponents,
  ...inventoryOpenApiComponents,
  ...materialTransferOpenApiComponents,
  ...storeOpenApiComponents,
  ...materialRequestOpenApiComponents,
  ...deliveryNoteOpenApiComponents,
  ...centralInventoryOpenApiComponents,
  ...procurementDocumentOpenApiComponents,
  ...procurementDashboardOpenApiComponents,
};

/** Every procurement operation (M5). */
export const procurementOpenApiOperations: OpenApiOperation[] = [
  ...accessOpenApiOperations,
  ...purchaseRequestOpenApiOperations,
  ...purchaseOrderOpenApiOperations,
  ...goodsReceiptOpenApiOperations,
  ...inventoryOpenApiOperations,
  ...materialTransferOpenApiOperations,
  ...storeOpenApiOperations,
  ...materialRequestOpenApiOperations,
  ...deliveryNoteOpenApiOperations,
  ...centralInventoryOpenApiOperations,
  ...procurementDocumentOpenApiOperations,
  ...procurementDashboardOpenApiOperations,
];
