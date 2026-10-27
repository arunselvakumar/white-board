import { prisma, type PrismaClient } from "@repo/construction-db";

import { BackdatedPolicyHandlers } from "../application/backdated-policy-handlers";
import { PrismaBackdatedPolicyStore } from "./prisma-backdated-policy-store";
import { PrismaRoleRepository } from "./prisma-role-repository";

export function createBackdatedPolicyHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  const db = deps?.prisma ?? prisma;
  return new BackdatedPolicyHandlers(
    new PrismaBackdatedPolicyStore(db),
    new PrismaRoleRepository(db),
  );
}
