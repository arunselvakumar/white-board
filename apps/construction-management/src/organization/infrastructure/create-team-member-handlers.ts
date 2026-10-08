import { prisma, type PrismaClient } from "@repo/db";

import {
  InProcessEventDispatcher,
  type EventDispatcher,
} from "@/src/shared-kernel/events";

import type { PlanGate } from "../application/plan-gate";
import { TeamMemberHandlers } from "../application/team-member-handlers";
import { createPlanGate } from "./create-subscription-handlers";
import { PrismaDesignationRepository } from "./prisma-designation-repository";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";

export function createTeamMemberHandlers(deps?: {
  prisma?: PrismaClient;
  plan?: PlanGate;
  events?: EventDispatcher;
}) {
  const db = deps?.prisma ?? prisma;
  return new TeamMemberHandlers(
    new PrismaTeamMemberRepository(db, privateDataCipher),
    new PrismaDesignationRepository(db),
    deps?.plan ?? createPlanGate({ prisma: db }),
    deps?.events ?? new InProcessEventDispatcher(),
  );
}
