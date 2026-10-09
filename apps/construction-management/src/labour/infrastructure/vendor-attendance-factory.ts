import { prisma, type PrismaClient } from "@repo/db";

import { VendorAttendanceHandlers } from "../application/vendor-attendance-handlers";
import { PrismaDirectories } from "./prisma-directories";
import { PrismaVendorStore } from "./prisma-vendor-store";
import {
  PrismaVendorAttendanceBackdatedGuard,
  PrismaVendorAttendanceStore,
} from "./vendor-attendance-store";

/** Vendor attendance handlers over Prisma (CM-212). */
export function createVendorAttendanceHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  const db = deps?.prisma ?? prisma;
  const directories = new PrismaDirectories(db);
  const vendors = new PrismaVendorStore(db);
  return new VendorAttendanceHandlers(
    new PrismaVendorAttendanceStore(db),
    vendors,
    directories.projects,
    directories.labourCategories,
    new PrismaVendorAttendanceBackdatedGuard(db, (workspaceId) =>
      vendors.today(workspaceId),
    ),
  );
}
