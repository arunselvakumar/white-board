import { z } from "zod";

import { DELETE_ACCOUNT_REASON_MAX } from "@/src/organization/application/account-deletion-handlers";

import { ActionCodeField } from "../../action-codes/action-code-models";

export const ACCOUNT_PATH = "/api/construction/organization/me/account";

/** What My Profile → Privacy needs before offering Delete My Account. */
export const GetConstructionOrganizationMyAccountResponseModel = z.object({
  ownedCompanies: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe(
      "Companies the User owns; while there are any, Delete My Account answers 409 `OWNER_MUST_HAND_OVER`",
    ),
});

export type GetConstructionOrganizationMyAccountResponseModel = z.infer<
  typeof GetConstructionOrganizationMyAccountResponseModel
>;

/** Delete My Account (CM-907, ADR CM-0021 §10). */
export const DeleteConstructionOrganizationMyAccountRequestModel = z.object({
  reason: z.string().trim().max(DELETE_ACCOUNT_REASON_MAX).nullish(),
  confirmation: z.string().describe("The word DELETE, typed by the User"),
  code: ActionCodeField.describe("The `delete_account` code"),
});

export type DeleteConstructionOrganizationMyAccountRequestModel = z.infer<
  typeof DeleteConstructionOrganizationMyAccountRequestModel
>;
