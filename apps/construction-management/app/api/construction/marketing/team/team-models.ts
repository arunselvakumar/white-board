import { z } from "zod";

import type {
  NeedsReassigning,
  TeamReadModel,
} from "@/src/marketing/application/team-handlers";
import {
  FOLLOW_UP_TYPES,
  STAGES,
} from "@/src/marketing/domain/marketing-terms";
import { VISIT_TARGET_MAX } from "@/src/marketing/domain/team";

export const TEAM_PATH = "/api/construction/marketing/team";

export const ConstructionMarketingTeamMemberParamsModel = z.object({
  memberId: z.uuid(),
});

export const SetConstructionMarketingVisitTargetRequestModel = z.object({
  /** Visits a month from this month on; null for none. */
  target: z.number().int().min(0).max(VISIT_TARGET_MAX).nullable(),
});

const Ref = z.object({ id: z.uuid(), name: z.string() });

export const GetConstructionMarketingTeamResponseModel = z.object({
  /** `YYYY-MM`, the Company's current month. */
  month: z.string(),
  people: z.array(
    z.object({
      memberId: z.uuid(),
      name: z.string(),
      mobile: z.string().nullable(),
      isOwner: z.boolean(),
      active: z.boolean(),
      visitsThisMonth: z.number().int(),
      target: z.number().int().nullable(),
      followUpsOverdue: z.number().int(),
      lastVisitAt: z.iso.datetime().nullable(),
    }),
  ),
  canSetTargets: z.boolean(),
  /** Add Staff with this Role preselected; null without one or the right. */
  addPersonRoleId: z.uuid().nullable(),
  canAddPerson: z.boolean(),
});

export const GetConstructionMarketingNeedsReassigningResponseModel = z.object({
  companies: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      city: z.string().nullable(),
      stage: z.enum(STAGES),
      assignedTo: Ref,
      /** Open Follow-ups Reassign moves with it, whoever owns them. */
      openFollowUps: z.number().int(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  followUps: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(FOLLOW_UP_TYPES),
      dueDate: z.iso.date(),
      owner: Ref,
      prospectCompany: Ref,
      updatedAt: z.iso.datetime(),
    }),
  ),
});

export function toTeamResponse(team: TeamReadModel) {
  return {
    ...team,
    people: team.people.map((row) => ({
      ...row,
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
    })),
  };
}

export function toNeedsReassigningResponse(found: NeedsReassigning) {
  return {
    companies: found.companies.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    })),
    followUps: found.followUps.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}
