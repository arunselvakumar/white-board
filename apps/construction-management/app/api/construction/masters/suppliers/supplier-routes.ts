import { procurementPartyUsage } from "@/src/composition/procurement-usage";
import { createPartyHandlers } from "@/src/masters/infrastructure/create-party-handlers";

import { partyRoutes } from "../_lib/party-routes";
import {
  CreateConstructionMastersSupplierRequestModel,
  UpdateConstructionMastersSupplierRequestModel,
} from "./supplier-models";

/** Suppliers under the `masters.suppliers` Menu (CM-406). */
export const supplierRoutes = partyRoutes({
  menu: "masters.suppliers",
  handlers: createPartyHandlers("supplier", {
    usage: procurementPartyUsage(),
  }),
  models: {
    create: CreateConstructionMastersSupplierRequestModel,
    update: UpdateConstructionMastersSupplierRequestModel,
  },
});
