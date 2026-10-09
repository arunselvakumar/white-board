import { prisma, type PrismaClient } from "@repo/construction-db";

import type { PlanGate } from "@/src/shared-kernel/plan";

import { SubscriptionHandlers } from "../application/subscription-handlers";
import { SubscriptionPlanGate } from "../application/subscription-plan-gate";
import type {
  PaymentGateway,
  WebhookVerifier,
} from "../application/subscription-ports";
import type { PlanCatalogue } from "../domain/plan";
import type { Seller } from "../domain/subscription-order";
import {
  paymentGatewayFromEnv,
  webhookVerifierFromEnv,
} from "./payment-gateway-from-env";
import { planCatalogue } from "./plan-catalogue";
import { PrismaSubscriptionRepository } from "./prisma-subscription-repository";
import { PrismaProjectCounter, PrismaUsageReader } from "./prisma-usage-reader";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";
import { sellerFromEnv } from "./seller";
import { PrismaStoredFilesMeter } from "./storage-meter";

type Deps = {
  prisma?: PrismaClient;
  catalogue?: PlanCatalogue;
  clock?: () => Date;
};

function usageReader(db: PrismaClient) {
  return new PrismaUsageReader(
    new PrismaTeamMemberRepository(db, privateDataCipher),
    new PrismaProjectCounter(db),
    new PrismaStoredFilesMeter(db),
  );
}

/** Plan limits for create commands in every context (CM-118). */
export function createPlanGate(deps?: Deps): PlanGate {
  const db = deps?.prisma ?? prisma;
  return new SubscriptionPlanGate(
    new PrismaSubscriptionRepository(db),
    usageReader(db),
    deps?.catalogue ?? planCatalogue,
    deps?.clock,
  );
}

export function createSubscriptionHandlers(
  deps?: Deps & {
    /** null = payments not configured; omitted = from the environment. */
    gateway?: PaymentGateway | null;
    webhookVerifier?: WebhookVerifier;
    seller?: Seller;
  },
) {
  const db = deps?.prisma ?? prisma;
  return new SubscriptionHandlers(
    new PrismaSubscriptionRepository(db),
    usageReader(db),
    deps?.catalogue ?? planCatalogue,
    deps?.gateway === undefined ? paymentGatewayFromEnv() : deps.gateway,
    deps?.webhookVerifier ?? webhookVerifierFromEnv(),
    deps?.seller ?? sellerFromEnv(),
    deps?.clock,
  );
}
