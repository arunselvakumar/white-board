import type { z } from "zod";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import { academicYearsOpenApi } from "../academic-years/openapi";
import { announcementsOpenApi } from "../announcements/openapi";
import { attendanceOpenApi } from "../attendance/openapi";
import { centresOpenApi } from "../centres/openapi";
import { childrenOpenApi } from "../children/openapi";
import { classroomsOpenApi } from "../classrooms/openapi";
import { dailyReportsOpenApi } from "../daily-reports/openapi";
import { dashboardOpenApi } from "../dashboard/openapi";
import { enquiriesOpenApi } from "../enquiries/openapi";
import { familyOpenApi } from "../family/openapi";
import { feesOpenApi } from "../fees/openapi";
import { meOpenApi } from "../me/openapi";
import { observationsOpenApi } from "../observations/openapi";
import { programmesOpenApi } from "../programmes/openapi";
import { progressReportsOpenApi } from "../progress-reports/openapi";
import { royaltyOpenApi } from "../royalty/openapi";
import { setupOpenApi } from "../setup/openapi";
import { staffOpenApi } from "../staff/openapi";
import { stockOpenApi } from "../stock/openapi";

/** One area's routes and the models they name as OpenAPI components. */
export type PreschoolOpenApi = {
  operations: OpenApiOperation[];
  components: Record<string, z.ZodType>;
};

const AREAS: PreschoolOpenApi[] = [
  meOpenApi,
  centresOpenApi,
  setupOpenApi,
  programmesOpenApi,
  classroomsOpenApi,
  staffOpenApi,
  enquiriesOpenApi,
  childrenOpenApi,
  attendanceOpenApi,
  dailyReportsOpenApi,
  feesOpenApi,
  announcementsOpenApi,
  familyOpenApi,
  observationsOpenApi,
  progressReportsOpenApi,
  dashboardOpenApi,
  royaltyOpenApi,
  stockOpenApi,
  academicYearsOpenApi,
];

export const preschoolOperations: OpenApiOperation[] = AREAS.flatMap(
  (area) => area.operations,
);

export const preschoolComponents: Record<string, z.ZodType> =
  Object.fromEntries(AREAS.flatMap((area) => Object.entries(area.components)));
