import { z } from "zod";

import { ConstructionOrganizationTeamMemberResponseModel } from "./team-member-models";

export const ListConstructionOrganizationTeamMembersResponseModel = z.object({
  items: z.array(ConstructionOrganizationTeamMemberResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListConstructionOrganizationTeamMembersResponseModel = z.infer<
  typeof ListConstructionOrganizationTeamMembersResponseModel
>;
