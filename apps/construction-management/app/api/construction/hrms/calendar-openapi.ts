import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  branchOpenApiComponents,
  branchOpenApiOperations,
} from "./branches/branches-openapi";
import {
  holidayOpenApiComponents,
  holidayOpenApiOperations,
} from "./holidays/holidays-openapi";
import {
  shiftOpenApiComponents,
  shiftOpenApiOperations,
} from "./shift-templates/shifts-openapi";

/** Branches, holidays, shifts, rotations and assignments (CM-304 – CM-307). */
export const calendarOpenApiComponents: OpenApiComponents = {
  ...branchOpenApiComponents,
  ...holidayOpenApiComponents,
  ...shiftOpenApiComponents,
};

export const calendarOpenApiOperations: OpenApiOperation[] = [
  ...branchOpenApiOperations,
  ...holidayOpenApiOperations,
  ...shiftOpenApiOperations,
];
