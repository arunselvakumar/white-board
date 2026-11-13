import { prisma } from "@repo/construction-db";

import { ProspectCompanyHandlers } from "@/src/marketing/application/prospect-company-handlers";
import { prismaCompanyFollowUpsReader } from "@/src/marketing/infrastructure/prisma-follow-up-store";
import { prismaProspectCompanyStore } from "@/src/marketing/infrastructure/prisma-prospect-company-store";
import { prismaCompanyVisitsReader } from "@/src/marketing/infrastructure/prisma-visit-store";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import { marketingClientProjects } from "./marketing-client-projects";
import { marketingTeam } from "./marketing-team";

/**
 * Prospect Company handlers (ADR CM-0040) wired to Prisma, the team and
 * the Projects of the company's client name.
 */
export function createProspectCompanyHandlers(): ProspectCompanyHandlers {
  return new ProspectCompanyHandlers({
    db: prisma,
    store: prismaProspectCompanyStore,
    team: marketingTeam,
    visits: prismaCompanyVisitsReader,
    followUps: prismaCompanyFollowUpsReader,
    projects: marketingClientProjects,
    timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
  });
}

/** One set of handlers for every Prospect Company route. */
export const prospectCompanyHandlers = createProspectCompanyHandlers();
