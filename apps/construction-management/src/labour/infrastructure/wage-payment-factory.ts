import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  NO_ACCOUNT_POSTING,
  type AccountPosting,
} from "@/src/shared-kernel/account-posting";
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

/**
 * Wage payments (CM-215) over Prisma and the Company's file storage. The
 * routes pass finance's `accountPosting` (composition, CM-707); without it
 * nothing reaches the account ledger.
 */
export function createWagePaymentHandlers(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  accounts?: AccountPosting;
}): WagePaymentHandlers {
  const db = deps?.prisma ?? prisma;
  const directories = new PrismaDirectories(db);
  return new WagePaymentHandlers(
    new PrismaWagePaymentStore(db, deps?.accounts ?? NO_ACCOUNT_POSTING),
    directories.projects,
    directories.teamMembers,
    new PrismaWagePaymentBackdatedGuard(db),
    deps?.storage ?? objectStorage(),
  );
}

/** Labour and vendor balances (CM-214) over Prisma. */
export function createBalanceHandlers(deps?: {
  prisma?: PrismaClient;
  /** Names the account of each payment on the statement (CM-707). */
  accounts?: AccountPosting;
}): BalanceHandlers {
  const db = deps?.prisma ?? prisma;
  return new BalanceHandlers(
    new PrismaBalanceStore(db, deps?.accounts ?? NO_ACCOUNT_POSTING),
    new PrismaDirectories(db).projects,
  );
}
