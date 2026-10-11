import { equipmentHandlers as handlers, registerWrite } from "../../handlers";
import { TransferConstructionSiteWorkEquipmentRequestModel } from "../../equipment-models";

export const dynamic = "force-dynamic";

/**
 * Transfer to Project / Transfer to Warehouse (Equipments Transfer,
 * CM-0016 §11): records a movement and moves it. 409
 * `EQUIPMENT_IN_MAINTENANCE`, `EQUIPMENT_AT_WAREHOUSE`; 400 for the date
 * rules and the same Project.
 */
export const POST = registerWrite(
  "transfer",
  TransferConstructionSiteWorkEquipmentRequestModel,
  (access, id, { expectedUpdatedAt, ...input }) =>
    handlers.transfer(access, id, new Date(expectedUpdatedAt), input),
);
