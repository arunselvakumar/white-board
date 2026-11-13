import { prisma } from "@repo/construction-db";

import { FollowUpHandlers } from "@/src/marketing/application/follow-up-handlers";
import { prismaFollowUpStore } from "@/src/marketing/infrastructure/prisma-follow-up-store";
import { prismaProspectCompanyStore } from "@/src/marketing/infrastructure/prisma-prospect-company-store";
import { prismaVisitStore } from "@/src/marketing/infrastructure/prisma-visit-store";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";

import { marketingTeam } from "./marketing-team";

/** Follow-up handlers (ADR CM-0040 §8) wired to Prisma and the team. */
export function createFollowUpHandlers(): FollowUpHandlers {
  return new FollowUpHandlers({
    db: prisma,
    store: prismaFollowUpStore,
    companyStore: prismaProspectCompanyStore,
    visitStore: prismaVisitStore,
    team: marketingTeam,
    today: (workspaceId) => companyToday(prisma, workspaceId),
    timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
  });
}

/** One set of handlers for every Follow-up route and the Visit form. */
export const followUpHandlers = createFollowUpHandlers();
