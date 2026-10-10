import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { createPartyQuotations } from "@/src/masters/infrastructure/create-party-handlers";

import { quotationRoutes } from "./quotation-routes";

/**
 * One composition for quotation files (CM-501). Storage limits are the
 * organization context's plan; the routes are where contexts meet.
 */
export const partyQuotations = createPartyQuotations({ plan: createPlanGate() });

export const supplierQuotationRoutes = quotationRoutes(
  "supplier",
  partyQuotations,
);

export const contractorQuotationRoutes = quotationRoutes(
  "contractor",
  partyQuotations,
);
