import {
  equipmentHandlers as handlers,
  maintenanceWrite,
} from "../../../../handlers";
import { DeleteConstructionSiteWorkEquipmentMaintenanceRequestModel } from "../../../../equipment-models";

export const dynamic = "force-dynamic";

/** Deletes a maintenance entry (a tombstone; Equipments Update). */
export const POST = maintenanceWrite(
  DeleteConstructionSiteWorkEquipmentMaintenanceRequestModel,
  (access, { id, maintenanceId }, body) =>
    handlers.deleteMaintenance(
      access,
      id,
      maintenanceId,
      new Date(body.expectedUpdatedAt),
    ),
);
