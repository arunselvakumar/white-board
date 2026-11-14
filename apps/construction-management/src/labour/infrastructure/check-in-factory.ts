import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import type { QueueHandler } from "@/src/shared-kernel/queue";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { CheckInHandlers } from "../application/check-in-handlers";
import { checkInPhotoRetentionHandler } from "../application/check-in-retention";
import {
  PrismaCheckInRetentionStore,
  PrismaCheckInStore,
  PrismaSiteEngineerDirectory,
  PrismaSiteFenceDirectory,
} from "./prisma-check-in-store";
import { companyToday } from "@/src/shared-kernel/company-today";

import { PrismaLabourAttendanceBackdatedGuard } from "./labour-attendance-store";
import { PrismaDirectories } from "./prisma-directories";

/** Check-In handlers over Prisma and the Company's object storage (ADR CM-0043). */
export function createCheckInHandlers(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): CheckInHandlers {
  const db = deps?.prisma ?? prisma;
  const directories = new PrismaDirectories(db);
  return new CheckInHandlers(
    new PrismaCheckInStore(db),
    directories.projects,
    directories.labourCategories,
    new PrismaSiteEngineerDirectory(db),
    new PrismaSiteFenceDirectory(db),
    deps?.storage ?? objectStorage(),
    new PrismaLabourAttendanceBackdatedGuard(db, (workspaceId) =>
      companyToday(db, workspaceId),
    ),
    deps?.clock,
  );
}

/** The daily check-in photo retention job over Prisma and object storage. */
export function createCheckInPhotoRetentionHandler(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): QueueHandler {
  return checkInPhotoRetentionHandler({
    store: new PrismaCheckInRetentionStore(deps?.prisma ?? prisma),
    storage: deps?.storage ?? objectStorage(),
    clock: deps?.clock,
  });
}
