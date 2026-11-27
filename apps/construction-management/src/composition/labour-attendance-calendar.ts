import { prisma, type PrismaClient } from "@repo/construction-db";

import { PrismaLabourAttendanceCalendar } from "@/src/labour/infrastructure/prisma-labour-attendance-calendar";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { notFound } from "@/src/shared-kernel/domain-error";

import { visibleProjectIds } from "./labour-activity";
import { PersonAttendanceService } from "./person-attendance";

/**
 * An Employee's Attendance tab (ADR CM-0051, CM-0055): their marked days
 * (from the sheet or from Check-In, whatever their Role), at the
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
    notFound: () =>
      notFound("EMPLOYEE_NOT_FOUND", "This Employee was not found."),
    now: deps?.now,
  });
}
