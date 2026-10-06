import { prisma, type PrismaClient } from "@repo/db";

import { GetOwnerDashboardHandler } from "../application/get-owner-dashboard.handler";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";

export type DashboardHandlers = {
  get: GetOwnerDashboardHandler;
};

export function createDashboardHandlers(deps?: {
  prisma?: PrismaClient;
}): DashboardHandlers {
  return {
    get: new GetOwnerDashboardHandler(
      deps?.prisma ?? prisma,
      new PrismaClassExceptionsReader(deps?.prisma ?? prisma),
    ),
  };
}
