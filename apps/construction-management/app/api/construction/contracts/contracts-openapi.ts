import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  contractsAccessOpenApiComponents,
  contractsAccessOpenApiOperations,
} from "./access/access-openapi";
import {
  contractsAdvancesOpenApiComponents,
  contractsAdvancesOpenApiOperations,
} from "./advances/advances-openapi";
import {
  contractsClientBillsOpenApiComponents,
  contractsClientBillsOpenApiOperations,
} from "./client-bills/client-bills-openapi";
import {
  contractsContractorBillsOpenApiComponents,
  contractsContractorBillsOpenApiOperations,
} from "./contractor-bills/contractor-bills-openapi";
import {
  contractsBoqOpenApiComponents,
  contractsBoqOpenApiOperations,
} from "./boq/boq-openapi";
import {
  contractsDashboardOpenApiComponents,
  contractsDashboardOpenApiOperations,
} from "./dashboard/dashboard-openapi";
import {
  contractsEscalationBillsOpenApiComponents,
  contractsEscalationBillsOpenApiOperations,
} from "./escalation-bills/escalation-bills-openapi";
import {
  contractsEscalationClausesOpenApiComponents,
  contractsEscalationClausesOpenApiOperations,
} from "./escalation-clauses/escalation-clauses-openapi";
import {
  contractsPriceIndicesOpenApiComponents,
  contractsPriceIndicesOpenApiOperations,
} from "./price-indices/price-indices-openapi";
import {
  contractsItemsOpenApiComponents,
  contractsItemsOpenApiOperations,
} from "./items/items-openapi";
import {
  contractsMeasurementsOpenApiComponents,
  contractsMeasurementsOpenApiOperations,
} from "./measurements/measurements-openapi";
import {
  contractsWorkOrdersOpenApiComponents,
  contractsWorkOrdersOpenApiOperations,
} from "./work-orders/work-orders-openapi";

/** Every contracts model (M11); each area owns its own file. */
export const contractsOpenApiComponents: OpenApiComponents = {
  ...contractsAccessOpenApiComponents,
  ...contractsItemsOpenApiComponents,
  ...contractsBoqOpenApiComponents,
  ...contractsWorkOrdersOpenApiComponents,
  ...contractsMeasurementsOpenApiComponents,
  ...contractsContractorBillsOpenApiComponents,
  ...contractsClientBillsOpenApiComponents,
  ...contractsAdvancesOpenApiComponents,
  ...contractsPriceIndicesOpenApiComponents,
  ...contractsEscalationClausesOpenApiComponents,
  ...contractsEscalationBillsOpenApiComponents,
  ...contractsDashboardOpenApiComponents,
};

/** Every contracts operation (M11). */
export const contractsOpenApiOperations: OpenApiOperation[] = [
  ...contractsAccessOpenApiOperations,
  ...contractsItemsOpenApiOperations,
  ...contractsBoqOpenApiOperations,
  ...contractsWorkOrdersOpenApiOperations,
  ...contractsMeasurementsOpenApiOperations,
  ...contractsContractorBillsOpenApiOperations,
  ...contractsClientBillsOpenApiOperations,
  ...contractsAdvancesOpenApiOperations,
  ...contractsPriceIndicesOpenApiOperations,
  ...contractsEscalationClausesOpenApiOperations,
  ...contractsEscalationBillsOpenApiOperations,
  ...contractsDashboardOpenApiOperations,
];
