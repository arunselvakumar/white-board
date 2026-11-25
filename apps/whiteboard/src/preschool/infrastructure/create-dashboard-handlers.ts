import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { DashboardHandlers } from "../application/dashboard-handlers";
import { HeadOfficeHandlers } from "../application/head-office-handlers";
import { RoyaltyHandlers } from "../application/royalty-handlers";
import { PrismaDashboardStore } from "./prisma-dashboard-store";
import { PrismaHeadOfficeStore } from "./prisma-head-office-store";
import { PrismaRoyaltyStore } from "./prisma-royalty-store";

export function createDashboardHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): {
  dashboard: DashboardHandlers;
  headOffice: HeadOfficeHandlers;
  royalty: RoyaltyHandlers;
} {
  const db = deps?.prisma ?? prisma;
  const now = deps?.now ?? (() => new Date());
  const royaltyStore = new PrismaRoyaltyStore(db);
  return {
    dashboard: new DashboardHandlers({
      store: new PrismaDashboardStore(db),
      now,
    }),
    headOffice: new HeadOfficeHandlers({
      store: new PrismaHeadOfficeStore(db),
      royalty: royaltyStore,
      now,
    }),
    royalty: new RoyaltyHandlers({ store: royaltyStore, now }),
  };
}
