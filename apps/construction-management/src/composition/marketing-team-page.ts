import { prisma } from "@repo/construction-db";

import { TeamHandlers } from "@/src/marketing/application/team-handlers";
import { prismaTeamStore } from "@/src/marketing/infrastructure/prisma-team-store";
import { MARKETING_ROLE } from "@/src/organization/infrastructure/role-seeds";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";
import { zoneInstant } from "@/src/shared-kernel/zone-time";

import { marketingTeam } from "./marketing-team";

/** Marketing → Team (ADR CM-0040 §4) wired to Prisma and the organization. */
export const teamHandlers = new TeamHandlers({
  db: prisma,
  store: prismaTeamStore,
  team: marketingTeam,
  today: (workspaceId) => companyToday(prisma, workspaceId),
  timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
  dayStart: (date, timeZone) => zoneInstant(date, 0, timeZone),
  async marketingRoleId(workspaceId) {
    const role = await prisma.constructionOrganizationRole.findFirst({
      where: {
        workspaceId,
        name: MARKETING_ROLE,
        isSeed: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    return role?.id ?? null;
  },
});
