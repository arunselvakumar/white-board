import { equipmentHandlers as handlers, registerWrite } from "../../handlers";
import { UpdateConstructionSiteWorkEquipmentRequestModel } from "../../equipment-models";

export const dynamic = "force-dynamic";

/**
 * Edits the register's fields (Equipments Update). Leave `hireRate` out to
 * keep the stored rate; sending it needs Financial. 409
 * `EQUIPMENT_NUMBER_TAKEN`, `EQUIPMENT_CHANGED`.
 */
export const POST = registerWrite(
  "update",
  UpdateConstructionSiteWorkEquipmentRequestModel,
  (access, id, { expectedUpdatedAt, ...input }) =>
    handlers.update(access, id, new Date(expectedUpdatedAt), input),
);
