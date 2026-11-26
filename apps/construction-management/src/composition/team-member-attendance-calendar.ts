import { prisma, type PrismaClient } from "@repo/construction-db";

import { createAttendanceDays } from "@/src/hrms/infrastructure/create-hrms-ports";
import { PrismaHrmsAttendanceCalendar } from "@/src/hrms/infrastructure/prisma-hrms-attendance-calendar";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { notFound } from "@/src/shared-kernel/domain-error";

import { PersonAttendanceService } from "./person-attendance";

/**
 * An Office Staff member's Attendance tab (ADR CM-0051): their HRMS days
 * with the HRMS day status, and hours by the branch or Project site they
 * checked in at. Not filtered by Project (§5): HRMS Attendance Read
 * already shows the whole Company's register.
 */
export function createTeamMemberAttendanceCalendar(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): PersonAttendanceService {
  const db = deps?.prisma ?? prisma;
  return new PersonAttendanceService({
    source: new PrismaHrmsAttendanceCalendar({
      days: createAttendanceDays({ prisma: db }),
      prisma: db,
      now: deps?.now,
    }),
    measure: "hours",
    recordsAbsence: true,
    visibleProjectIds: () => null,
    projectNames: (workspaceId, ids) => projectNames(workspaceId, ids, db),
    timeZoneOf: (workspaceId) => companyTimezone(db, workspaceId),
    notFound: () =>
      notFound("TEAM_MEMBER_NOT_FOUND", "This Team Member was not found."),
    now: deps?.now,
  });
}
