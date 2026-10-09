import { prisma, type PrismaClient } from "@repo/construction-db";

import { LabourAttendanceHandlers } from "../application/labour-attendance-handlers";
import {
  PrismaLabourAttendanceBackdatedGuard,
  PrismaLabourAttendanceStore,
} from "./labour-attendance-store";
import { PrismaDirectories } from "./prisma-directories";

/** Labour attendance handlers over Prisma (CM-210). */
export function createLabourAttendanceHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  const db = deps?.prisma ?? prisma;
  const directories = new PrismaDirectories(db);
  const store = new PrismaLabourAttendanceStore(db);
  return new LabourAttendanceHandlers(
    store,
    directories.projects,
    directories.labourCategories,
    directories.supervisors,
    new PrismaLabourAttendanceBackdatedGuard(db, (workspaceId) =>
      store.today(workspaceId),
    ),
  );
}
