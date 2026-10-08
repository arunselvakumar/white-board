import { z } from "zod";

export const RevealConstructionOrganizationTeamMemberIdsResponseModel =
  z.object({ aadhaar: z.string().nullable(), pan: z.string().nullable() });
