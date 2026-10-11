import { equipmentHandlers as handlers, registerWrite } from "../../handlers";
import { OpenConstructionSiteWorkEquipmentMaintenanceRequestModel } from "../../equipment-models";

export const dynamic = "force-dynamic";

/**
 * Log Maintenance: opens the one maintenance entry (Equipments Update;
 * a cost needs Financial). 409 `MAINTENANCE_ALREADY_OPEN`.
 */
export const POST = registerWrite(
  "update",
  OpenConstructionSiteWorkEquipmentMaintenanceRequestModel,
  (access, id, { expectedUpdatedAt, ...input }) =>
    handlers.openMaintenance(access, id, new Date(expectedUpdatedAt), input),
);
