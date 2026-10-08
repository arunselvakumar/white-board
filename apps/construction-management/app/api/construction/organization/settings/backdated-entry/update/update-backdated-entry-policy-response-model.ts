import { z } from "zod";

import { backdatedEntryPolicyResponseFields } from "../get-backdated-entry-policy-response-model";

export const UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel =
  z.object(backdatedEntryPolicyResponseFields);

export type UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel =
  z.infer<
    typeof UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel
  >;
