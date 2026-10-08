import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/get-backdated-entry-policy-response-model";
import type { UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-request-model";
import type { UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-response-model";

import type {
  UpdateConstructionOrganizationSequenceRuleRequestModel,
  UpdateConstructionOrganizationSequenceRuleResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/[id]/update/update-sequence-rule-models";
import type {
  CreateConstructionOrganizationSequenceRuleRequestModel,
  CreateConstructionOrganizationSequenceRuleResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/create-sequence-rule-models";
import type { ListConstructionOrganizationSequenceRulesResponseModel } from "@/app/api/construction/organization/settings/sequence-rules/list-sequence-rules-models";

import { apiJson } from "./http";

const SETTINGS = "/api/construction/organization/settings";

/** Designations as Settings needs them: id and name only. */
export type DesignationOption = { id: string; name: string };

/**
 * The Company's Designations for override pickers. The Designations route
 * is owned by the Designations screens (CM-112); Settings reads only
 * `items[].id` and `items[].name`.
 */
export const designationOptionsQuery = queryOptions({
  queryKey: ["organization", "designations", "options"],
  queryFn: async (): Promise<DesignationOption[]> => {
    const body = await apiJson<{ items: DesignationOption[] }>(
      "/api/construction/organization/designations",
    );
    return body.items.map((item) => ({ id: item.id, name: item.name }));
  },
});

export const backdatedEntryPolicyQuery = queryOptions({
  queryKey: ["organization", "settings", "backdated-entry"],
  queryFn: () =>
    apiJson<GetConstructionOrganizationBackdatedEntryPolicyResponseModel>(
      `${SETTINGS}/backdated-entry`,
    ),
});

export function updateBackdatedEntryPolicy(
  input: UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel,
): Promise<UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel> {
  return apiJson(`${SETTINGS}/backdated-entry/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type SequenceRuleItem =
  ListConstructionOrganizationSequenceRulesResponseModel["items"][number];

/** Every live rule; small (one default per module plus one per Project). */
export const sequenceRulesQuery = queryOptions({
  queryKey: ["organization", "settings", "sequence-rules"],
  queryFn: () =>
    apiJson<ListConstructionOrganizationSequenceRulesResponseModel>(
      `${SETTINGS}/sequence-rules`,
    ),
});

export function createSequenceRule(
  input: CreateConstructionOrganizationSequenceRuleRequestModel,
): Promise<CreateConstructionOrganizationSequenceRuleResponseModel> {
  return apiJson(`${SETTINGS}/sequence-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateSequenceRule(
  id: string,
  input: UpdateConstructionOrganizationSequenceRuleRequestModel,
): Promise<UpdateConstructionOrganizationSequenceRuleResponseModel> {
  return apiJson(
    `${SETTINGS}/sequence-rules/${encodeURIComponent(id)}/update`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function deleteSequenceRule(id: string): Promise<void> {
  return apiJson(
    `${SETTINGS}/sequence-rules/${encodeURIComponent(id)}/delete`,
    {
      method: "POST",
    },
  );
}
