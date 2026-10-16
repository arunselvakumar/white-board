import { z } from "zod";

import { ACTION_CODE_PURPOSES } from "@/src/shared-kernel/action-codes";

export const ACTION_CODES_PATH = "/api/construction/organization/action-codes";

/** Ask for a six-digit code before a sensitive action (ADR CM-0021 §8, §10, §11). */
export const RequestConstructionOrganizationActionCodeRequestModel = z.object({
  purpose: z
    .enum(ACTION_CODE_PURPOSES)
    .describe(
      "`delete_account` for any signed-in User; `reveal_identifiers` for any member of the Active Company (tied to this session); `transfer_ownership`, `delete_company` and `company_backup` for the Owner of the Active Company",
    ),
});

export type RequestConstructionOrganizationActionCodeRequestModel = z.infer<
  typeof RequestConstructionOrganizationActionCodeRequestModel
>;

/** The six digits as typed; spaces are ignored. */
export const ActionCodeField = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.")
  .describe("The six-digit code that was sent");

/**
 * Verify a reveal code on its own: it opens a 10-minute window of Aadhaar
 * and PAN reveals in this session. Every other purpose is verified by the
 * action it guards.
 */
export const VerifyConstructionOrganizationActionCodeRequestModel = z.object({
  purpose: z.literal("reveal_identifiers"),
  code: ActionCodeField,
});

export type VerifyConstructionOrganizationActionCodeRequestModel = z.infer<
  typeof VerifyConstructionOrganizationActionCodeRequestModel
>;
