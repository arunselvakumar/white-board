import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  financeAccessOpenApiComponents,
  financeAccessOpenApiOperations,
} from "./access/access-openapi";
import {
  financeAccountOpenApiComponents,
  financeAccountOpenApiOperations,
} from "./accounts/accounts-openapi";
import {
  financeDocumentOpenApiComponents,
  financeDocumentOpenApiOperations,
} from "./documents/documents-openapi";
import {
  pettyCashOpenApiComponents,
  pettyCashOpenApiOperations,
} from "./petty-cash/petty-cash-openapi";
import {
  paymentCategoryOpenApiComponents,
  paymentCategoryOpenApiOperations,
} from "./payment-categories/payment-categories-openapi";
import {
  financeLookupOpenApiComponents,
  financeLookupOpenApiOperations,
} from "./lookups-openapi";

/** Every finance model (M7); each area owns its own file. */
export const financeOpenApiComponents: OpenApiComponents = {
  ...financeAccessOpenApiComponents,
  ...financeAccountOpenApiComponents,
  ...financeLookupOpenApiComponents,
  ...financeDocumentOpenApiComponents,
  ...paymentCategoryOpenApiComponents,
  ...pettyCashOpenApiComponents,
};

export const financeOpenApiOperations: OpenApiOperation[] = [
  ...financeAccessOpenApiOperations,
  ...financeAccountOpenApiOperations,
  ...financeLookupOpenApiOperations,
  ...financeDocumentOpenApiOperations,
  ...paymentCategoryOpenApiOperations,
  ...pettyCashOpenApiOperations,
];
