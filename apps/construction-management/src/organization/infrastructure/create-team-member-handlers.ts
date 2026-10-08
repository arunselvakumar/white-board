import { constructionOrigin } from "@repo/auth/construction/server";
import { prisma, type PrismaClient } from "@repo/db";

import {
  InProcessEventDispatcher,
  type EventDispatcher,
} from "@/src/shared-kernel/events";

import {
  InvitationNotifier,
  type InvitationChannels,
} from "../application/invitation-notifier";
import { JoinRequestHandlers } from "../application/join-requests";
import { UNLIMITED_PLAN, type PlanGate } from "../application/plan-gate";
import { TeamMemberHandlers } from "../application/team-member-handlers";
import { authCompanyMemberships } from "./auth-company-memberships";
import { invitationChannels } from "./invitation-channels";
import { PrismaCompanyProfileReader } from "./prisma-company-profile-reader";
import { PrismaDesignationRepository } from "./prisma-designation-repository";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";

export function createTeamMemberHandlers(deps?: {
  prisma?: PrismaClient;
  plan?: PlanGate;
  events?: EventDispatcher;
  channels?: InvitationChannels;
}) {
  const db = deps?.prisma ?? prisma;
  const members = new PrismaTeamMemberRepository(db, privateDataCipher);
  const designations = new PrismaDesignationRepository(db);
  const profiles = new PrismaCompanyProfileReader(db);
  const events =
    deps?.events ??
    new InProcessEventDispatcher([
      new InvitationNotifier(
        members,
        designations,
        profiles,
        deps?.channels ?? invitationChannels,
        constructionOrigin,
      ),
    ]);
  return new TeamMemberHandlers(
    members,
    designations,
    deps?.plan ?? UNLIMITED_PLAN,
    events,
  );
}

export function createJoinRequestHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new JoinRequestHandlers(
    new PrismaTeamMemberRepository(db, privateDataCipher),
    authCompanyMemberships,
    new PrismaCompanyProfileReader(db),
  );
}
