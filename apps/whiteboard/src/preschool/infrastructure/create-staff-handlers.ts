import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { StaffHandlers } from "../application/staff-handlers";
import type { StaffInviter } from "../application/staff-ports";
import { PrismaStaffStore } from "./prisma-staff-store";
import { WorkspaceStaffInviter } from "./workspace-staff-inviter";

export function createStaffHandlers(deps?: {
  prisma?: PrismaClient;
  inviter?: StaffInviter;
  now?: () => Date;
}): StaffHandlers {
  return new StaffHandlers({
    store: new PrismaStaffStore(deps?.prisma ?? prisma),
    inviter: deps?.inviter ?? new WorkspaceStaffInviter(),
    now: deps?.now ?? (() => new Date()),
  });
}
