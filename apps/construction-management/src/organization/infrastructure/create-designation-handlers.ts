import { prisma, type PrismaClient } from "@repo/db";

import { DesignationHandlers } from "../application/designation-handlers";
import { PrismaDesignationRepository } from "./prisma-designation-repository";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";

export function createDesignationHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  const teamMembers = new PrismaTeamMemberRepository(db, privateDataCipher);
  return new DesignationHandlers(
    new PrismaDesignationRepository(db),
    () => new Date(),
    (workspaceId, id) => teamMembers.usesDesignation(workspaceId, id),
  );
}
