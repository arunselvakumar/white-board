import { prisma } from "@repo/construction-db";

import { DashboardHandlers } from "@/src/marketing/application/dashboard-handlers";
import { prismaDashboardStore } from "@/src/marketing/infrastructure/prisma-dashboard-store";
import { prismaTeamStore } from "@/src/marketing/infrastructure/prisma-team-store";
import { todayIn } from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { zoneInstant } from "@/src/shared-kernel/zone-time";

import { marketingTeam } from "./marketing-team";

/** The Marketing Dashboard (ADR CM-0040 §13) wired to Prisma and the organization. */
export const dashboardHandlers = new DashboardHandlers({
  store: prismaDashboardStore,
  teamStore: prismaTeamStore,
  team: marketingTeam,
  timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
  dateIn: (instant, timeZone) => todayIn(timeZone, instant),
  dayStart: (date, timeZone) => zoneInstant(date, 0, timeZone),
});
