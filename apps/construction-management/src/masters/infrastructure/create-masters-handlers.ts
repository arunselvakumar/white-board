import { prisma, type PrismaClient } from "@repo/db";

import { LookupHandlers } from "../application/lookup-handlers";
import { SupervisorHandlers } from "../application/supervisor-handlers";
import type { LookupKind } from "../domain/master-kind";
import { PrismaLookupStore } from "./prisma-lookup-store";
import { prismaMasterUsage } from "./prisma-master-usage";
import { PrismaSupervisorStore } from "./prisma-supervisor-store";
import { PrismaTeamMemberDirectory } from "./prisma-team-member-directory";

/** Labour Categories (`labour_category`) or Departments (`department`). */
export function createLookupHandlers(
  kind: LookupKind,
  deps?: { prisma?: PrismaClient },
) {
  const db = deps?.prisma ?? prisma;
  return new LookupHandlers(
    kind,
    new PrismaLookupStore(db),
    () => new Date(),
    prismaMasterUsage(db),
  );
}

export function createSupervisorHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new SupervisorHandlers(
    new PrismaSupervisorStore(db),
    new PrismaTeamMemberDirectory(db),
    () => new Date(),
    prismaMasterUsage(db),
  );
}
