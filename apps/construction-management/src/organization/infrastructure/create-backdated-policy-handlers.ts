import { prisma, type PrismaClient } from "@repo/db";

import { BackdatedPolicyHandlers } from "../application/backdated-policy-handlers";
import { PrismaBackdatedPolicyStore } from "./prisma-backdated-policy-store";
import { PrismaDesignationRepository } from "./prisma-designation-repository";

export function createBackdatedPolicyHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  const db = deps?.prisma ?? prisma;
  return new BackdatedPolicyHandlers(
    new PrismaBackdatedPolicyStore(db),
    new PrismaDesignationRepository(db),
  );
}
