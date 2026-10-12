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
import {
  financeOtherExpenseOpenApiComponents,
  financeOtherExpenseOpenApiOperations,
} from "./other-expenses/other-expenses-openapi";
import {
  financeOtherPartyOpenApiComponents,
  financeOtherPartyOpenApiOperations,
} from "./other-parties/other-parties-openapi";
import {
  financeTransactionOpenApiComponents,
  financeTransactionOpenApiOperations,
} from "./transactions/transactions-openapi";
import {
  partyFinanceOpenApiComponents,
  partyFinanceOpenApiOperations,
} from "./parties/party-finance-openapi";

/** Every finance model (M7); each area owns its own file. */
export const financeOpenApiComponents: OpenApiComponents = {
  ...financeAccessOpenApiComponents,
  ...financeAccountOpenApiComponents,
  ...financeLookupOpenApiComponents,
  ...financeTransactionOpenApiComponents,
  ...financeDocumentOpenApiComponents,
  ...paymentCategoryOpenApiComponents,
  ...pettyCashOpenApiComponents,
  ...financeOtherPartyOpenApiComponents,
  ...financeOtherExpenseOpenApiComponents,
  ...partyFinanceOpenApiComponents,
};

export const financeOpenApiOperations: OpenApiOperation[] = [
  ...financeAccessOpenApiOperations,
  ...financeAccountOpenApiOperations,
  ...financeLookupOpenApiOperations,
  ...financeTransactionOpenApiOperations,
  ...financeDocumentOpenApiOperations,
  ...paymentCategoryOpenApiOperations,
  ...pettyCashOpenApiOperations,
  ...financeOtherPartyOpenApiOperations,
  ...financeOtherExpenseOpenApiOperations,
  ...partyFinanceOpenApiOperations,
];
