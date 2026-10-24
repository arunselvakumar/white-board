import { z } from "zod";

import { TeamMemberPasswordModel } from "../../team-member-models";

/** Set a new password for a Team Member (ADR CM-0029 §7). */
export const SetConstructionOrganizationTeamMemberPasswordRequestModel =
  z.object({ password: TeamMemberPasswordModel });
