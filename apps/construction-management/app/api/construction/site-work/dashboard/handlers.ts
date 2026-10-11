import { prisma } from "@repo/construction-db";

import {
  dashboardAttendance,
  dashboardNames,
} from "@/src/composition/attendance-heads";
import { SiteWorkDashboard } from "@/src/site-work/application/site-work-dashboard";
import { prismaSiteWorkDashboardStore } from "@/src/site-work/infrastructure/prisma-site-work-dashboard-store";

/** The Project Dashboard's site-work sections (CM-608). */
export const siteWorkDashboard = new SiteWorkDashboard({
  db: prisma,
  store: prismaSiteWorkDashboardStore,
  attendance: dashboardAttendance,
  names: dashboardNames,
});

/** The dashboard's own menu: Read on the Project (ADR CM-0013 §12). */
export const DASHBOARD_MENU = "reporting.project_dashboard";
