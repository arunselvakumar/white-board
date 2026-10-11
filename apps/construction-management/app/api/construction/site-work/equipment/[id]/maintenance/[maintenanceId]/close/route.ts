import {
  equipmentHandlers as handlers,
  maintenanceWrite,
} from "../../../../handlers";
import { CloseConstructionSiteWorkEquipmentMaintenanceRequestModel } from "../../../../equipment-models";

export const dynamic = "force-dynamic";

/**
 * Return to Service: closes the open entry with an end date (on or after
 * the start, not after today), the final cost (Financial) and a remark.
 * 409 `MAINTENANCE_NOT_OPEN`.
 */
export const POST = maintenanceWrite(
  CloseConstructionSiteWorkEquipmentMaintenanceRequestModel,
  (access, { id, maintenanceId }, { expectedUpdatedAt, ...input }) =>
    handlers.closeMaintenance(
      access,
      id,
      maintenanceId,
      new Date(expectedUpdatedAt),
      input,
    ),
);
