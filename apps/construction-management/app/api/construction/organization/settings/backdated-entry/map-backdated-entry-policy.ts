import type { StoredBackdatedPolicy } from "@/src/organization/application/backdated-policy-handlers";
import { BACKDATED_MODULES } from "@/src/shared-kernel/backdated-policy";

import type { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "./get-backdated-entry-policy-response-model";

function limit(value: {
  days: number;
  overrideDesignationIds: readonly string[];
}) {
  return {
    days: value.days,
    overrideDesignationIds: [...value.overrideDesignationIds],
  };
}

export function mapBackdatedEntryPolicy(
  stored: StoredBackdatedPolicy,
): GetConstructionOrganizationBackdatedEntryPolicyResponseModel {
  const { policy } = stored;
  return {
    create: limit(policy.create),
    edit: limit(policy.edit),
    financialClosingDate: policy.financialClosingDate,
    modules: BACKDATED_MODULES.map((item) => {
      const setting = policy.modules[item.key];
      return {
        key: item.key,
        label: item.label,
        group: item.group,
        entryDateField: item.entryDateField,
        mode: setting.mode,
        create: limit(setting.create),
        edit: limit(setting.edit),
      };
    }),
    updatedAt: stored.updatedAt?.toISOString() ?? null,
  };
}
