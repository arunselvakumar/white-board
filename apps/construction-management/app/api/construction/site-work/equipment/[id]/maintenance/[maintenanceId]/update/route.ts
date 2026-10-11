import {
  equipmentHandlers as handlers,
  maintenanceWrite,
} from "../../../../handlers";
import { UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel } from "../../../../equipment-models";

export const dynamic = "force-dynamic";

/** Edits a maintenance entry; an open one stays open (Equipments Update). */
export const POST = maintenanceWrite(
  UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel,
  (access, { id, maintenanceId }, { expectedUpdatedAt, ...input }) =>
    handlers.editMaintenance(
      access,
      id,
      maintenanceId,
      new Date(expectedUpdatedAt),
      input,
    ),
);
