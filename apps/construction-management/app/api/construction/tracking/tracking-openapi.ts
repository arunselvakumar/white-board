import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  trackingAccessOpenApiComponents,
  trackingAccessOpenApiOperations,
} from "./access/access-openapi";
import {
  trackingDocumentOpenApiComponents,
  trackingDocumentOpenApiOperations,
} from "./documents/documents-openapi";
import {
  trackingTaskOpenApiComponents,
  trackingTaskOpenApiOperations,
} from "./tasks/tasks-openapi";
import {
  trackingIssueOpenApiComponents,
  trackingIssueOpenApiOperations,
} from "./issues/issues-openapi";
import {
  trackingInspectionOpenApiComponents,
  trackingInspectionOpenApiOperations,
} from "./inspections/inspections-openapi";
import {
  trackingDashboardOpenApiComponents,
  trackingDashboardOpenApiOperations,
} from "./dashboard/dashboard-openapi";

/** Every tracking model (M8); each area owns its own file. */
export const trackingOpenApiComponents: OpenApiComponents = {
  ...trackingAccessOpenApiComponents,
  ...trackingDocumentOpenApiComponents,
  ...trackingTaskOpenApiComponents,
  ...trackingIssueOpenApiComponents,
  ...trackingInspectionOpenApiComponents,
  ...trackingDashboardOpenApiComponents,
};

/** Every tracking operation (M8). */
export const trackingOpenApiOperations: OpenApiOperation[] = [
  ...trackingAccessOpenApiOperations,
  ...trackingDocumentOpenApiOperations,
  ...trackingTaskOpenApiOperations,
  ...trackingIssueOpenApiOperations,
  ...trackingInspectionOpenApiOperations,
  ...trackingDashboardOpenApiOperations,
];
