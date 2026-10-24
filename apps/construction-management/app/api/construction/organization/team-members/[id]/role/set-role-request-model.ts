import { z } from "zod";

/** Give a Team Member another Role (ADR CM-0030). */
export const SetConstructionOrganizationTeamMemberRoleRequestModel = z.object({
  roleId: z.uuid(),
});
