import { z } from "zod";

export const JoinLinkTokenParamsModel = z.object({
  token: z.string().min(16).max(64),
});

export const GetConstructionOrganizationJoinLinkResponseModel = z.object({
  id: z.uuid(),
  companyName: z.string(),
  memberName: z.string(),
  contacts: z.array(
    z.object({ kind: z.enum(["mobile", "email"]), masked: z.string() }),
  ),
});

export type GetConstructionOrganizationJoinLinkResponseModel = z.infer<
  typeof GetConstructionOrganizationJoinLinkResponseModel
>;
