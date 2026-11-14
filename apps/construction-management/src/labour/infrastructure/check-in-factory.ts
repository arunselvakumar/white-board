import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { CheckInHandlers } from "../application/check-in-handlers";
import {
  PrismaCheckInStore,
  PrismaSiteEngineerDirectory,
  PrismaSiteFenceDirectory,
} from "./prisma-check-in-store";
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
    deps?.clock,
  );
}
