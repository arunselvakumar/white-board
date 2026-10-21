import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  contractsAccessOpenApiComponents,
  contractsAccessOpenApiOperations,
} from "./access/access-openapi";
import {
  contractsBoqOpenApiComponents,
  contractsBoqOpenApiOperations,
} from "./boq/boq-openapi";
import {
  contractsItemsOpenApiComponents,
  contractsItemsOpenApiOperations,
} from "./items/items-openapi";

/** Every contracts model (M11); each area owns its own file. */
export const contractsOpenApiComponents: OpenApiComponents = {
  ...contractsAccessOpenApiComponents,
  ...contractsItemsOpenApiComponents,
  ...contractsBoqOpenApiComponents,
};

/** Every contracts operation (M11). */
export const contractsOpenApiOperations: OpenApiOperation[] = [
  ...contractsAccessOpenApiOperations,
  ...contractsItemsOpenApiOperations,
  ...contractsBoqOpenApiOperations,
];
