import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { BalanceHandlers } from "../application/balance-handlers";
import { WagePaymentHandlers } from "../application/wage-payment-handlers";
import { PrismaBalanceStore } from "./balance-store";
import { PrismaDirectories } from "./prisma-directories";
import {
  PrismaWagePaymentBackdatedGuard,
  PrismaWagePaymentStore,
} from "./wage-payment-store";

/** Wage payments (CM-215) over Prisma and the Company's file storage. */
export function createWagePaymentHandlers(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
}): WagePaymentHandlers {
  const db = deps?.prisma ?? prisma;
  const directories = new PrismaDirectories(db);
  return new WagePaymentHandlers(
    new PrismaWagePaymentStore(db),
    directories.projects,
    directories.teamMembers,
    new PrismaWagePaymentBackdatedGuard(db),
    deps?.storage ?? objectStorage(),
  );
}

/** Labour and vendor balances (CM-214) over Prisma. */
export function createBalanceHandlers(deps?: {
  prisma?: PrismaClient;
}): BalanceHandlers {
  const db = deps?.prisma ?? prisma;
  return new BalanceHandlers(
    new PrismaBalanceStore(db),
    new PrismaDirectories(db).projects,
  );
}
