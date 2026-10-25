import { z } from "zod";

import { teamMemberDetailFields } from "../../team-member-models";

/**
 * Leave `aadhaar`, `pan` or `monthlySalary` out to keep them; send null to
 * clear them.
 */
export const UpdateConstructionOrganizationTeamMemberRequestModel = z.object(
  teamMemberDetailFields,
);
