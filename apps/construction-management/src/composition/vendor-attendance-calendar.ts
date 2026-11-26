import { prisma, type PrismaClient } from "@repo/construction-db";

import { PrismaVendorAttendanceCalendar } from "@/src/labour/infrastructure/prisma-vendor-attendance-calendar";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { notFound } from "@/src/shared-kernel/domain-error";

import { visibleProjectIds } from "./labour-activity";
import { PersonAttendanceService } from "./person-attendance";

/**
 * A Vendor's Attendance tab (ADR CM-0051): the headcount they supplied
 * each day, at the Projects the viewer may open, measured in head-days.
 * Vendor attendance has no absences.
 */
export function createVendorAttendanceCalendar(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): PersonAttendanceService {
  const db = deps?.prisma ?? prisma;
  return new PersonAttendanceService({
    source: new PrismaVendorAttendanceCalendar(db),
    measure: "head_days",
    recordsAbsence: false,
    visibleProjectIds,
    projectNames: (workspaceId, ids) => projectNames(workspaceId, ids, db),
    timeZoneOf: (workspaceId) => companyTimezone(db, workspaceId),
    notFound: () => notFound("VENDOR_NOT_FOUND", "This Vendor was not found."),
    now: deps?.now,
  });
}
