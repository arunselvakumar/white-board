import { prisma } from "@repo/construction-db";

import { ProspectCompanyHandlers } from "@/src/marketing/application/prospect-company-handlers";
import { prismaProspectCompanyStore } from "@/src/marketing/infrastructure/prisma-prospect-company-store";

import { marketingTeam } from "./marketing-team";

/** Prospect Company handlers (ADR CM-0040) wired to Prisma and the team. */
export function createProspectCompanyHandlers(): ProspectCompanyHandlers {
  return new ProspectCompanyHandlers({
    db: prisma,
    store: prismaProspectCompanyStore,
    team: marketingTeam,
  });
}

/** One set of handlers for every Prospect Company route. */
export const prospectCompanyHandlers = createProspectCompanyHandlers();
