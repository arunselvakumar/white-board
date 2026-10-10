import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { PartyHandlers, type PartyUsage } from "../application/party-handlers";
import { PartyQuotations } from "../application/party-quotations";
import type { PartyKind } from "../domain/party";
import { PrismaPartyDirectory, PrismaPartyStore } from "./prisma-party-store";
import { PrismaQuotationStore } from "./prisma-quotation-store";

/** Contractors (`contractor`) or Suppliers (`supplier`), CM-406. */
export function createPartyHandlers(
  kind: PartyKind,
  deps?: { prisma?: PrismaClient; usage?: PartyUsage },
) {
  const db = deps?.prisma ?? prisma;
  return new PartyHandlers(
    kind,
    new PrismaPartyStore(db),
    new PrismaPartyDirectory(db),
    () => new Date(),
    deps?.usage,
  );
}

/**
 * Quotation files on Contractors and Suppliers (CM-501). Storage limits
 * are the organization context's plan, so the routes pass its `PlanGate`.
 */
export function createPartyQuotations(deps: {
  plan: PlanGate;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): PartyQuotations {
  return new PartyQuotations(
    new PrismaQuotationStore(deps.prisma ?? prisma),
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.clock,
  );
}
