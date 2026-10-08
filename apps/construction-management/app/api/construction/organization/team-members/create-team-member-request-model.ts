import { z } from "zod";

import {
  PermissionGrantsModel,
  teamMemberDetailFields,
} from "./team-member-models";

/** Add Team Member (the wizard's three steps in one request). */
export const CreateConstructionOrganizationTeamMemberRequestModel = z.object({
  ...teamMemberDetailFields,
  projectIds: z.array(z.string().min(1).max(64)).max(500).optional(),
  /** Omit to start from the Designation's template. Ignored for HRMS members. */
  permissions: PermissionGrantsModel.optional(),
});
