import { prisma, type PrismaClient } from "@repo/construction-db";

import { newId } from "@/src/shared-kernel/ids";

import {
  DevelopmentHandlers,
  ProjectDevelopmentHandlers,
} from "../application/development-handlers";
import { LookupHandlers } from "../application/lookup-handlers";
import type { MasterUsage } from "../application/ports";
import { SupervisorHandlers } from "../application/supervisor-handlers";
import {
  TrackingMasterHandlers,
  type TrackingMasterUsage,
} from "../application/tracking-master-handlers";
import { WorkTypeHandlers } from "../application/work-type-handlers";
import type { WorkTypeUsage } from "../application/work-type-ports";
import type {
  DevelopmentKind,
  LookupKind,
  TrackingMasterKind,
} from "../domain/master-kind";
import { PrismaDevelopmentStore } from "./prisma-development-store";
import { PrismaLookupStore } from "./prisma-lookup-store";
import { prismaMasterUsage } from "./prisma-master-usage";
import { PrismaProjectDirectory } from "./prisma-project-directory";
import { PrismaSupervisorStore } from "./prisma-supervisor-store";
import { PrismaTeamMemberDirectory } from "./prisma-team-member-directory";
import { PrismaTrackingMasterStore } from "./prisma-tracking-master-store";
import { PrismaWorkTypeStore } from "./prisma-work-type-store";

/**
 * Labour Categories (`labour_category`) or Departments (`department`).
 * `usage` adds other contexts' references (site work's, wired by the
 * routes from `src/composition`) to the masters' own.
 */
export function createLookupHandlers(
  kind: LookupKind,
  deps?: { prisma?: PrismaClient; usage?: MasterUsage },
) {
  const db = deps?.prisma ?? prisma;
  const own = prismaMasterUsage(db);
  const other = deps?.usage;
  const usage: MasterUsage =
    other == null
      ? own
      : async (...args) => (await own(...args)) || other(...args);
  return new LookupHandlers(
    kind,
    new PrismaLookupStore(db),
    () => new Date(),
    usage,
  );
}

/**
 * Work Types (CM-601). `usage` is site work's (live worksheets), wired by
 * the routes from `src/composition`.
 */
export function createWorkTypeHandlers(deps?: {
  prisma?: PrismaClient;
  usage?: WorkTypeUsage;
}) {
  return new WorkTypeHandlers(
    new PrismaWorkTypeStore(deps?.prisma ?? prisma),
    () => new Date(),
    deps?.usage,
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

/**
 * Issue Categories or Tags (CM-801). `usage` says which ids live tracking
 * records name; the routes pass `src/composition`'s, which reads
 * `construction_tracking`.
 */
export function createTrackingMasterHandlers(
  kind: TrackingMasterKind,
  deps: { usage: TrackingMasterUsage; prisma?: PrismaClient },
) {
  return new TrackingMasterHandlers(
    kind,
    new PrismaTrackingMasterStore(deps.prisma ?? prisma),
    deps.usage,
    (now) => newId(now.getTime()),
  );
}
