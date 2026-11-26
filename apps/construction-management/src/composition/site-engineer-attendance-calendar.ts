import { prisma, type PrismaClient } from "@repo/construction-db";

import { PrismaSiteEngineerAttendanceCalendar } from "@/src/labour/infrastructure/prisma-site-engineer-attendance-calendar";
import { masterNotFound } from "@/src/masters/domain/master-kind";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import { checkInProjectIds } from "./labour-activity";
import { PersonAttendanceService } from "./person-attendance";

/**
 * A Site Engineer's Attendance tab (ADR CM-0051): their days from the
 * Check-In log, each Check In to the next Check Out, at the Projects the
 * viewer has Attendance Read on (ADR CM-0044 §4). The log has no absences.
 */
export function createSiteEngineerAttendanceCalendar(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): PersonAttendanceService {
  const db = deps?.prisma ?? prisma;
  return new PersonAttendanceService({
    source: new PrismaSiteEngineerAttendanceCalendar(db),
    measure: "hours",
    recordsAbsence: false,
    visibleProjectIds: checkInProjectIds,
    projectNames: (workspaceId, ids) => projectNames(workspaceId, ids, db),
    timeZoneOf: (workspaceId) => companyTimezone(db, workspaceId),
    notFound: () => masterNotFound("supervisor"),
    now: deps?.now,
  });
}
