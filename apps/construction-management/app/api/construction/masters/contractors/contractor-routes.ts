import { createPartyHandlers } from "@/src/masters/infrastructure/create-party-handlers";

import { partyRoutes } from "../_lib/party-routes";
import {
  CreateConstructionMastersContractorRequestModel,
  UpdateConstructionMastersContractorRequestModel,
} from "./contractor-models";

/** Contractors under the `masters.contractors` Menu (CM-406). */
export const contractorRoutes = partyRoutes({
  menu: "masters.contractors",
  handlers: createPartyHandlers("contractor"),
  models: {
    create: CreateConstructionMastersContractorRequestModel,
    update: UpdateConstructionMastersContractorRequestModel,
  },
});
