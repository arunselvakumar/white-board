import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  GRN_OPTIONAL_FIELDS,
  isGrnOptionalField,
  type GrnOptionalField,
} from "@/src/shared-kernel/grn-fields";

export {
  GRN_FIELD_GROUP_LABELS,
  GRN_FIELD_GROUPS,
  GRN_FIELD_INFO,
  GRN_OPTIONAL_FIELDS,
  isGrnOptionalField,
  type GrnFieldGroup,
  type GrnOptionalField,
} from "@/src/shared-kernel/grn-fields";

/** The Company's GRN field visibility (ADR CM-0015 §9). */
export type GrnFieldSetting = {
  /** In screen order, no repeats. */
  hiddenFields: GrnOptionalField[];
  /** Null until the Company first saves. */
  updatedAt: Date | null;
};

/**
 * The hidden keys a save keeps: known keys only (400 `GRN_FIELD_UNKNOWN`
 * otherwise), each once, in screen order.
 */
export function grnHiddenFields(keys: readonly string[]): GrnOptionalField[] {
  const unknown = keys.filter((key) => !isGrnOptionalField(key));
  if (unknown.length > 0)
    throw new DomainError(
      "GRN_FIELD_UNKNOWN",
      "Some GRN fields are not optional fields.",
      { details: { fields: unknown } },
    );
  const chosen = new Set(keys);
  return GRN_OPTIONAL_FIELDS.filter((key) => chosen.has(key));
}

/** Stored keys as the screen shows them; keys no longer optional are dropped. */
export function storedGrnHiddenFields(
  keys: readonly string[],
): GrnOptionalField[] {
  const chosen = new Set(keys);
  return GRN_OPTIONAL_FIELDS.filter((key) => chosen.has(key));
}

export function grnFieldSettingChanged(): DomainError {
  return conflict(
    "GRN_FIELD_SETTING_CHANGED",
    "Someone else changed these settings after you opened them. Reload to see their changes.",
  );
}
