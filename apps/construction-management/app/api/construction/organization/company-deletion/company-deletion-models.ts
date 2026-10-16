import { z } from "zod";

import type { CompanyDeletionView } from "@/src/organization/application/company-deletion-handlers";

import { ActionCodeField } from "../action-codes/action-code-models";

export const COMPANY_DELETION_PATH =
  "/api/construction/organization/company-deletion";

const ConstructionOrganizationCompanyDeletionModel = z.object({
  requestedAt: z.iso.datetime(),
  scheduledFor: z.iso
    .datetime()
    .describe("When the daily job deletes the Company (requested + 30 days)"),
});

/** The Company's pending deletion, for the banner (any member). */
export const GetConstructionOrganizationCompanyDeletionResponseModel = z.object(
  {
    deletion: ConstructionOrganizationCompanyDeletionModel.nullable(),
  },
);

export type GetConstructionOrganizationCompanyDeletionResponseModel = z.infer<
  typeof GetConstructionOrganizationCompanyDeletionResponseModel
>;

/** Delete Company (CM-907, ADR CM-0021 §10). */
export const ScheduleConstructionOrganizationCompanyDeletionRequestModel =
  z.object({
    companyName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("The Company's name, typed by the Owner"),
    code: ActionCodeField.describe("The `delete_company` code"),
  });

export type ScheduleConstructionOrganizationCompanyDeletionRequestModel =
  z.infer<typeof ScheduleConstructionOrganizationCompanyDeletionRequestModel>;

export const ScheduleConstructionOrganizationCompanyDeletionResponseModel =
  ConstructionOrganizationCompanyDeletionModel;

export type ScheduleConstructionOrganizationCompanyDeletionResponseModel =
  z.infer<typeof ScheduleConstructionOrganizationCompanyDeletionResponseModel>;

export function toDeletionResponse(view: CompanyDeletionView) {
  return {
    requestedAt: view.requestedAt.toISOString(),
    scheduledFor: view.scheduledFor.toISOString(),
  };
}
