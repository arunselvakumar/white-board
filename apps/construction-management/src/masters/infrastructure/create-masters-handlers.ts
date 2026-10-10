import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  DevelopmentHandlers,
  ProjectDevelopmentHandlers,
} from "../application/development-handlers";
import { LookupHandlers } from "../application/lookup-handlers";
import { SupervisorHandlers } from "../application/supervisor-handlers";
import type { DevelopmentKind, LookupKind } from "../domain/master-kind";
import { PrismaDevelopmentStore } from "./prisma-development-store";
import { PrismaLookupStore } from "./prisma-lookup-store";
import { prismaMasterUsage } from "./prisma-master-usage";
import { PrismaProjectDirectory } from "./prisma-project-directory";
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

/** Amenities (`amenity`) or Common Developments (`common_development`), CM-404. */
export function createDevelopmentHandlers(
  kind: DevelopmentKind,
  deps?: { prisma?: PrismaClient },
) {
  const db = deps?.prisma ?? prisma;
  return new DevelopmentHandlers(
    kind,
    new PrismaDevelopmentStore(db),
    new PrismaProjectDirectory(db),
  );
}

/** A Project's Amenities and Common Developments (CM-404). */
export function createProjectDevelopmentHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  return new ProjectDevelopmentHandlers(
    new PrismaDevelopmentStore(deps?.prisma ?? prisma),
  );
}
