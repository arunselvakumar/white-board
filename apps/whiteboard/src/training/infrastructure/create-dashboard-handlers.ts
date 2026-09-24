import { prisma, type PrismaClient } from "@repo/db";

import { GetOwnerDashboardHandler } from "../application/get-owner-dashboard.handler";

export type DashboardHandlers = {
  get: GetOwnerDashboardHandler;
};

export function createDashboardHandlers(deps?: {
  prisma?: PrismaClient;
}): DashboardHandlers {
  return {
    get: new GetOwnerDashboardHandler(deps?.prisma ?? prisma),
  };
}
