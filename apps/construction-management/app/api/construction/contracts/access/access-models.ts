import { z } from "zod";

import { FLAGS } from "@/src/shared-kernel/access";

/** The Project the contracts menus are checked on. */
export const GetConstructionContractsAccessRequestModel = z.object({
  projectId: z.uuid(),
});

/**
 * The menus contracts screens hide actions by (M11, ADR CM-0023 §22): the
 * five Project menus, checked on the Project, and the Company's Item
 * Library.
 */
export const CONTRACTS_ACCESS_MENUS = [
  "contracts.boq",
  "contracts.work_orders",
  "contracts.measurements",
  "contracts.contractor_bills",
  "contracts.client_bills",
  "contracts.items",
] as const;
export type ContractsAccessMenu = (typeof CONTRACTS_ACCESS_MENUS)[number];

export const GetConstructionContractsAccessResponseModel = z
  .object({
    projectId: z.uuid(),
    /** Contract work (a Client is billed) or Own development (CM-0023 §2). */
    role: z.enum(["contract", "own"]),
    /** Wings (a building) or Locations: BOQ items may name either. */
    structure: z.enum(["wings", "locations"]),
    menus: z.record(z.enum(CONTRACTS_ACCESS_MENUS), z.array(z.enum(FLAGS))),
  })
  .meta({
    description:
      "For each contracts menu, the flags the caller holds on the Project (the Item Library is Company-wide). The UI hides what is missing; every route checks again.",
  });
export type GetConstructionContractsAccessResponseModel = z.infer<
  typeof GetConstructionContractsAccessResponseModel
>;
