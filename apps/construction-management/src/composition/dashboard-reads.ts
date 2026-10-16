import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  CompanyDashboardReader,
  ProjectDashboardKpis,
} from "@/src/reporting/application/dashboard-reads";
import { prismaDashboardSource } from "@/src/reporting/infrastructure/prisma-dashboard-source";

import { trackingProjectProgress } from "./project-progress";

/**
 * The Project Dashboard's KPI tiles and Due Payments over the
 * `construction_reporting` views (CM-902).
 */
export function projectDashboardKpis(
  db: PrismaClient = prisma,
): ProjectDashboardKpis {
  return new ProjectDashboardKpis(prismaDashboardSource(db));
}

/**
 * The Company Dashboard (CM-902): the reporting views, plus Project
 * Progress % from Tasks through the tracking read the Projects home uses.
 */
export function companyDashboardReader(
  db: PrismaClient = prisma,
): CompanyDashboardReader {
  return new CompanyDashboardReader({
    source: prismaDashboardSource(db),
    progress: trackingProjectProgress(db),
  });
}
