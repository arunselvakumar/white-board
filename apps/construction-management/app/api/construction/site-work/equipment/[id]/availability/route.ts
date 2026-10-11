import { equipmentHandlers as handlers, registerWrite } from "../../handlers";
import { SetConstructionSiteWorkEquipmentAvailabilityRequestModel } from "../../equipment-models";

export const dynamic = "force-dynamic";

/**
 * Mark unavailable for worksheet entry (since today) / Make it available
 * (Equipments Update). Unavailable equipment takes no usage sheet.
 */
export const POST = registerWrite(
  "update",
  SetConstructionSiteWorkEquipmentAvailabilityRequestModel,
  (access, id, body) =>
    handlers.setAvailability(
      access,
      id,
      new Date(body.expectedUpdatedAt),
      body.available,
    ),
);
