import { z } from "zod";

import { ConstructionOrganizationDesignationResponseModel } from "./designation-response-model";

export const ListConstructionOrganizationDesignationsResponseModel = z.object({
  items: z.array(ConstructionOrganizationDesignationResponseModel),
  total: z.int().nonnegative(),
});

export type ListConstructionOrganizationDesignationsResponseModel = z.infer<
  typeof ListConstructionOrganizationDesignationsResponseModel
>;
