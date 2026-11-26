import { prisma, type PrismaClient } from "@repo/construction-db";

import { PrismaLabourAttendanceCalendar } from "@/src/labour/infrastructure/prisma-labour-attendance-calendar";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { notFound } from "@/src/shared-kernel/domain-error";

import { visibleProjectIds } from "./labour-activity";
import { PersonAttendanceService } from "./person-attendance";

/**
 * A Labour's Attendance tab (ADR CM-0051): their marked days, at the
 * Projects the viewer may open, with hours from In and Out or the working
 * hours marked.
 */
export function createLabourAttendanceCalendar(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): PersonAttendanceService {
  const db = deps?.prisma ?? prisma;
  return new PersonAttendanceService({
    source: new PrismaLabourAttendanceCalendar(db),
    measure: "hours",
    recordsAbsence: true,
    visibleProjectIds,
    projectNames: (workspaceId, ids) => projectNames(workspaceId, ids, db),
    timeZoneOf: (workspaceId) => companyTimezone(db, workspaceId),
    notFound: () => notFound("LABOUR_NOT_FOUND", "This Labour was not found."),
    now: deps?.now,
  });
}
