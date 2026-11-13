import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  marketingCompanyOpenApiComponents,
  marketingCompanyOpenApiOperations,
} from "./companies/companies-openapi";
import {
  marketingDashboardOpenApiComponents,
  marketingDashboardOpenApiOperations,
} from "./dashboard/dashboard-openapi";
import {
  marketingFollowUpOpenApiComponents,
  marketingFollowUpOpenApiOperations,
} from "./follow-ups/follow-ups-openapi";
import {
  marketingTeamOpenApiComponents,
  marketingTeamOpenApiOperations,
} from "./team/team-openapi";
import {
  marketingVisitOpenApiComponents,
  marketingVisitOpenApiOperations,
} from "./visits/visits-openapi";

/** Every marketing model (ADR CM-0040); each area owns its own file. */
export const marketingOpenApiComponents: OpenApiComponents = {
  ...marketingCompanyOpenApiComponents,
  ...marketingVisitOpenApiComponents,
  ...marketingFollowUpOpenApiComponents,
  ...marketingTeamOpenApiComponents,
  ...marketingDashboardOpenApiComponents,
};

/** Every marketing operation. */
export const marketingOpenApiOperations: OpenApiOperation[] = [
  ...marketingCompanyOpenApiOperations,
  ...marketingVisitOpenApiOperations,
  ...marketingFollowUpOpenApiOperations,
  ...marketingTeamOpenApiOperations,
  ...marketingDashboardOpenApiOperations,
];
