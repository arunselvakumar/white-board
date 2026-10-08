import { z } from "zod";

export const AssignConstructionOrganizationTeamMemberProjectsRequestModel =
  z.object({ projectIds: z.array(z.string().min(1).max(64)).max(500) });
