import { z } from "zod";

export const JoinRequestIdParamsModel = z.object({ id: z.uuid() });

export const ListConstructionOrganizationJoinRequestsResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      companyId: z.string(),
      companyName: z.string(),
      memberName: z.string(),
      invitedAt: z.iso.datetime().nullable(),
    }),
  ),
});

export type ListConstructionOrganizationJoinRequestsResponseModel = z.infer<
  typeof ListConstructionOrganizationJoinRequestsResponseModel
>;

export const AcceptConstructionOrganizationJoinRequestResponseModel = z.object({
  companyId: z.string(),
});

export type AcceptConstructionOrganizationJoinRequestResponseModel = z.infer<
  typeof AcceptConstructionOrganizationJoinRequestResponseModel
>;
