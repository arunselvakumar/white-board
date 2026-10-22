import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { messagingEvents } from "@/src/composition/messaging";
import { MeasurementHandlers } from "@/src/contracts/application/measurement-handlers";
import { MeasurementPhotos } from "@/src/contracts/application/measurement-photos";
import type { MeasurementDeps } from "@/src/contracts/application/measurement-ports";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { PrismaMeasurementStore } from "@/src/contracts/infrastructure/prisma-measurement-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { companyToday } from "@/src/shared-kernel/company-today";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

/**
 * The Measurement Book (CM-1105) wired to Prisma, the BOQ store (its lock,
 * items and deviation limit), Work Orders, the contracts directory, the
 * location resolver, the Back-dated Entry policy and messaging
 * (`MeasurementSubmitted`).
 */
export function createMeasurementDeps(): MeasurementDeps {
  return {
    db: prisma,
    store: new PrismaMeasurementStore(),
    boq: new PrismaBoqStore(),
    workOrders: new PrismaWorkOrderStore(),
    directory: contractsDirectory,
    locations: createProjectLocations(),
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: messagingEvents(),
  };
}

/** One set of handlers for every Measurement Book route. */
export const measurementHandlers = new MeasurementHandlers(
  createMeasurementDeps(),
);

/**
 * A sheet's photos through the attachments service, with the plan's
 * storage limit from the organization context. Not the Gallery.
 */
export const measurementPhotos = new MeasurementPhotos({
  db: prisma,
  store: new PrismaMeasurementStore(),
  boq: new PrismaBoqStore(),
  storage: objectStorage(),
  plan: createPlanGate(),
});
