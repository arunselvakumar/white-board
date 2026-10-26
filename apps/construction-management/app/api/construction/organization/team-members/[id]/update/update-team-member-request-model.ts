import { z } from "zod";

import { teamMemberDetailFields } from "../../team-member-models";

/**
 * Leave `aadhaar`, `pan` or any salary field out to keep it; send null to
 * clear Aadhaar, PAN or a salary amount.
 */
export const UpdateConstructionOrganizationTeamMemberRequestModel = z.object(
  teamMemberDetailFields,
);
