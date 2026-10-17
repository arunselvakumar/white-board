import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  salesAccessOpenApiComponents,
  salesAccessOpenApiOperations,
} from "./access/access-openapi";
import {
  salesBookingOpenApiComponents,
  salesBookingOpenApiOperations,
} from "./bookings/bookings-openapi";
import {
  salesDashboardOpenApiComponents,
  salesDashboardOpenApiOperations,
} from "./dashboard/dashboard-openapi";
import {
  salesInquiryOpenApiComponents,
  salesInquiryOpenApiOperations,
} from "./inquiries/inquiries-openapi";
import {
  salesSettingsOpenApiComponents,
  salesSettingsOpenApiOperations,
} from "./settings/settings-openapi";
import {
  salesUnitOpenApiComponents,
  salesUnitOpenApiOperations,
} from "./units/units-openapi";

/** Every sales model (M10); each area owns its own file. */
export const salesOpenApiComponents: OpenApiComponents = {
  ...salesAccessOpenApiComponents,
  ...salesSettingsOpenApiComponents,
  ...salesInquiryOpenApiComponents,
  ...salesUnitOpenApiComponents,
  ...salesBookingOpenApiComponents,
  ...salesDashboardOpenApiComponents,
};

/** Every sales operation (M10). */
export const salesOpenApiOperations: OpenApiOperation[] = [
  ...salesAccessOpenApiOperations,
  ...salesSettingsOpenApiOperations,
  ...salesInquiryOpenApiOperations,
  ...salesUnitOpenApiOperations,
  ...salesBookingOpenApiOperations,
  ...salesDashboardOpenApiOperations,
];
