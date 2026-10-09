import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { GetOwnerDashboardHandler } from "../application/get-owner-dashboard.handler";
import { createFeeDuesHandlers } from "./create-fee-dues-handlers";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";

export type DashboardHandlers = {
  get: GetOwnerDashboardHandler;
};

export function createDashboardHandlers(deps?: {
  prisma?: PrismaClient;
}): DashboardHandlers {
  const db = deps?.prisma ?? prisma;
  const feeDues = createFeeDuesHandlers({ prisma: db });
  return {
    get: new GetOwnerDashboardHandler(
      db,
      new PrismaClassExceptionsReader(db),
      async (workspaceId) =>
        (await feeDues.queries.followUpsDue({ workspaceId })).length,
    ),
  };
}
