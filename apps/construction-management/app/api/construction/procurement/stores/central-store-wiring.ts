import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  createStoreFormOptions,
  materialRequestPartyOptions,
} from "@/src/composition/central-store-options";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { DeliveryNoteHandlers } from "@/src/procurement/application/delivery-note-handlers";
import { MaterialRequestHandlers } from "@/src/procurement/application/material-request-handlers";
import { StoreHandlers } from "@/src/procurement/application/store-handlers";
import { PrismaCentralInventory } from "@/src/procurement/infrastructure/central-inventory-reader";
import { PrismaDeliveryNoteRepository } from "@/src/procurement/infrastructure/delivery-note-repository";
import { PrismaMaterialRequestRepository } from "@/src/procurement/infrastructure/material-request-repository";
import { stockLedger } from "@/src/procurement/infrastructure/stock-ledger-instance";
import { PrismaStoreRepository } from "@/src/procurement/infrastructure/store-repository";
import { procurementEvents } from "@/src/procurement/infrastructure/procurement-events";

/**
 * The Central Store handlers (CM-508, CM-509) wired over Prisma, the
 * procurement directory, the location resolver and the stock ledger.
 */
export function createCentralStore(db: PrismaClient = prisma) {
  const formOptions = createStoreFormOptions(db);
  const inventory = new PrismaCentralInventory(
    db,
    procurementDirectory,
    async (workspaceId) => (await formOptions.read(workspaceId)).projects,
  );
  const requests = new PrismaMaterialRequestRepository(
    db,
    procurementDirectory,
    createProjectLocations({ prisma: db }),
    projectMediaDispatcher(),
  );
  return {
    stores: new StoreHandlers(
      new PrismaStoreRepository(db, procurementDirectory, inventory),
      formOptions,
    ),
    materialRequests: new MaterialRequestHandlers(requests),
    deliveryNotes: new DeliveryNoteHandlers(
      new PrismaDeliveryNoteRepository(
        db,
        procurementDirectory,
        requests,
        stockLedger(),
        procurementEvents,
        projectMediaDispatcher(),
      ),
    ),
    inventory,
    partyOptions: (workspaceId: string, projectId: string) =>
      materialRequestPartyOptions(workspaceId, projectId, db),
  };
}

export const centralStore = createCentralStore();
