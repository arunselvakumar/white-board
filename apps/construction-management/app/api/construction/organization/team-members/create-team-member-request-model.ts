import { z } from "zod";

import {
  TeamMemberPasswordModel,
  teamMemberDetailFields,
} from "./team-member-models";

/**
 * Add Staff (ADR CM-0030 §6): details, salary, Member Type, Projects and
 * the Role.
 * `password` makes the sign-in account at once (`invite` is then ignored);
 * otherwise `invite` sends the invitation (needs an email) or, false,
 * keeps a record to invite later.
 */
export const CreateConstructionOrganizationTeamMemberRequestModel = z.object({
  ...teamMemberDetailFields,
  projectIds: z.array(z.string().min(1).max(64)).max(500).optional(),
  roleId: z.uuid(),
  invite: z.boolean().default(true),
  password: TeamMemberPasswordModel.nullish(),
});
