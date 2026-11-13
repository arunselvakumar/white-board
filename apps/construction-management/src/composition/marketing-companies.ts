import { prisma } from "@repo/construction-db";

import { ProspectCompanyHandlers } from "@/src/marketing/application/prospect-company-handlers";
import { prismaProspectCompanyStore } from "@/src/marketing/infrastructure/prisma-prospect-company-store";
import { prismaCompanyVisitsReader } from "@/src/marketing/infrastructure/prisma-visit-store";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import { marketingTeam } from "./marketing-team";

/** Prospect Company handlers (ADR CM-0040) wired to Prisma and the team. */
export function createProspectCompanyHandlers(): ProspectCompanyHandlers {
  return new ProspectCompanyHandlers({
    db: prisma,
    store: prismaProspectCompanyStore,
    team: marketingTeam,
    visits: prismaCompanyVisitsReader,
    timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
  });
}

/** One set of handlers for every Prospect Company route. */
export const prospectCompanyHandlers = createProspectCompanyHandlers();
