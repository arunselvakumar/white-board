import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  marketingCompanyOpenApiComponents,
  marketingCompanyOpenApiOperations,
} from "./companies/companies-openapi";
import {
  marketingVisitOpenApiComponents,
  marketingVisitOpenApiOperations,
} from "./visits/visits-openapi";

/** Every marketing model (ADR CM-0040); each area owns its own file. */
export const marketingOpenApiComponents: OpenApiComponents = {
  ...marketingCompanyOpenApiComponents,
  ...marketingVisitOpenApiComponents,
};

/** Every marketing operation. */
export const marketingOpenApiOperations: OpenApiOperation[] = [
  ...marketingCompanyOpenApiOperations,
  ...marketingVisitOpenApiOperations,
];
