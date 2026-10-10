import { prisma } from "@repo/construction-db";

import { requireInventoryAccess, procurementEvents } from "../inventory/handlers";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { MaterialTransferCommands } from "@/src/procurement/infrastructure/material-transfer-store";

/** Material Transfers (CM-507). */
export const materialTransfers = new MaterialTransferCommands({
  db: prisma,
  directory: procurementDirectory,
  dispatcher: procurementEvents,
  media: projectMediaDispatcher(),
});

/**
 * The Session for a transfer route; the commands check the Material
 * Transfer flag on the side the action is about (source for create, edit,
 * approve, reject and delete; destination for Mark as Delivered).
 */
export function requireTransferSession(request: Request, write: boolean) {
  return requireInventoryAccess(request, null, write ? "create" : "read");
}
