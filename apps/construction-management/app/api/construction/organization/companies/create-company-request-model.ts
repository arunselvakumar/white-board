import { z } from "zod";

import { companyWriteFields } from "./company-fields";

export const CreateConstructionOrganizationCompanyRequestModel =
  z.object(companyWriteFields);

export type CreateConstructionOrganizationCompanyRequestModel = z.infer<
  typeof CreateConstructionOrganizationCompanyRequestModel
>;
