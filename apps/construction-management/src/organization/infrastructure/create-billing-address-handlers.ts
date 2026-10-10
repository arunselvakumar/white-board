import { prisma, type PrismaClient } from "@repo/construction-db";

import { BillingAddressHandlers } from "../application/billing-address-handlers";
import { PrismaBillingAddressStore } from "./prisma-billing-address-store";

export function createBillingAddressHandlers(deps?: { prisma?: PrismaClient }) {
  return new BillingAddressHandlers(
    new PrismaBillingAddressStore(deps?.prisma ?? prisma),
  );
}
