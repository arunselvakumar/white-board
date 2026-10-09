import { prisma, type PrismaClient } from "@repo/construction-db";

import { VendorHandlers } from "../application/vendor-handlers";
import { PrismaDirectories } from "./prisma-directories";
import { PrismaVendorStore } from "./prisma-vendor-store";

export function createVendorHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  const directories = new PrismaDirectories(db);
  return new VendorHandlers(
    new PrismaVendorStore(db),
    directories.projects,
    directories.labourCategories,
  );
}
