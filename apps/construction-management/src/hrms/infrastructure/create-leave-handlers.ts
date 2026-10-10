import { prisma, type PrismaClient } from "@repo/construction-db";

import { LeaveBalanceHandlers } from "../application/leave-balance-handlers";
import { LeaveConfigurationHandlers } from "../application/leave-configuration-handlers";
import { LeaveRequestHandlers } from "../application/leave-request-handlers";
import { createHrmsPorts } from "./create-hrms-ports";
import { PrismaLeaveBackdatedGuard } from "./prisma-leave-day-source";
import {
  PrismaLeaveQueries,
  PrismaLeaveTransactions,
} from "./prisma-leave-store";
import { PrismaLeaveStructureStore } from "./prisma-leave-structure-store";
import { PrismaLeaveTypeStore } from "./prisma-leave-type-store";

export type LeaveHandlers = {
  configuration: LeaveConfigurationHandlers;
  balances: LeaveBalanceHandlers;
  requests: LeaveRequestHandlers;
};

/**
 * Leave (CM-310 … CM-313) over Prisma. The work calendar and the month
 * lock come from `createHrmsPorts`, so the real holiday and shift calendar
 * is picked up wherever it is swapped in.
 */
export function createLeaveHandlers(deps?: {
  prisma?: PrismaClient;
  clock?: () => Date;
}): LeaveHandlers {
  const db = deps?.prisma ?? prisma;
  const clock = deps?.clock ?? (() => new Date());
  const ports = createHrmsPorts({ prisma: db });
  const types = new PrismaLeaveTypeStore(db);
  const structures = new PrismaLeaveStructureStore(db);
  const queries = new PrismaLeaveQueries(db, clock);
  const transactions = new PrismaLeaveTransactions(db);
  return {
    configuration: new LeaveConfigurationHandlers(
      types,
      structures,
      ports.employees,
      clock,
    ),
    balances: new LeaveBalanceHandlers(
      types,
      structures,
      ports.employees,
      ports.settings,
      queries,
      transactions,
      clock,
    ),
    requests: new LeaveRequestHandlers(
      types,
      structures,
      ports.employees,
      ports.settings,
      ports.calendar,
      ports.monthLock,
      new PrismaLeaveBackdatedGuard(db, (workspaceId) =>
        queries.today(workspaceId),
      ),
      queries,
      transactions,
      clock,
    ),
  };
}
