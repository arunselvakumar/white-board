import { DomainError } from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";
import { isUuid } from "@/src/shared-kernel/ids";

/**
 * A Central Store (ADR CM-0015 §11): a Company warehouse that serves one
 * or more Projects. Store keepers are Team Members; Suppliers are the ones
 * a Purchase Order for the store may name.
 */

export const STORE_LIMITS = {
  name: 120,
  address: 500,
  projects: 200,
  keepers: 200,
  suppliers: 500,
} as const;

export type StoreInput = {
  name: string;
  address?: string | null;
  stateCode?: string | null;
  projectIds: readonly string[];
  keeperIds?: readonly string[] | null;
  supplierIds?: readonly string[] | null;
};

export type StoreDraft = {
  name: string;
  address: string | null;
  stateCode: string | null;
  projectIds: string[];
  keeperIds: string[];
  supplierIds: string[];
};

function ids(
  raw: readonly string[] | null | undefined,
  field: string,
  max: number,
): string[] {
  const list = [...new Set((raw ?? []).map((id) => id.trim().toLowerCase()))];
  const bad = list.filter((id) => !isUuid(id));
  if (bad.length > 0)
    throw new DomainError("ID_INVALID", "One of the ids is not valid.", {
      details: { field, ids: bad },
    });
  if (list.length > max)
    throw new DomainError("TOO_MANY", `Choose at most ${String(max)}.`, {
      details: { field },
    });
  return list;
}

/** Cleans and checks a Store's fields (400s with `details.field`). */
export function storeDraft(input: StoreInput): StoreDraft {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "")
    throw new DomainError("STORE_NAME_REQUIRED", "Enter the store name.", {
      details: { field: "name" },
    });
  if (name.length > STORE_LIMITS.name)
    throw new DomainError(
      "STORE_NAME_TOO_LONG",
      `Use at most ${String(STORE_LIMITS.name)} characters.`,
      { details: { field: "name" } },
    );
  const address = input.address?.trim() ?? "";
  if (address.length > STORE_LIMITS.address)
    throw new DomainError(
      "STORE_ADDRESS_TOO_LONG",
      `Use at most ${String(STORE_LIMITS.address)} characters.`,
      { details: { field: "address" } },
    );
  const stateCode = input.stateCode?.trim() ?? "";
  if (stateCode !== "" && !isGstStateCode(stateCode))
    throw new DomainError("STORE_STATE_INVALID", "Choose a GST state.", {
      details: { field: "stateCode" },
    });
  const projectIds = ids(input.projectIds, "projectIds", STORE_LIMITS.projects);
  if (projectIds.length === 0)
    throw new DomainError(
      "STORE_PROJECTS_REQUIRED",
      "Choose at least one Project.",
      { details: { field: "projectIds" } },
    );
  return {
    name,
    address: address === "" ? null : address,
    stateCode: stateCode === "" ? null : stateCode,
    projectIds,
    keeperIds: ids(input.keeperIds, "keeperIds", STORE_LIMITS.keepers),
    supplierIds: ids(input.supplierIds, "supplierIds", STORE_LIMITS.suppliers),
  };
}

/** What still ties a Store down; any of them refuses Delete (409 `STORE_IN_USE`). */
export type StoreUsage = {
  /** Materials with stock other than zero. */
  materialsInStock: number;
  /** Material Requests requested or partially delivered. */
  openMaterialRequests: number;
  /** Delivery Notes pending or in transit. */
  undeliveredDeliveryNotes: number;
  /** Material Transfers from or to the store, pending or in transit. */
  undeliveredTransfers: number;
};

export function assertStoreDeletable(usage: StoreUsage): void {
  const reasons: string[] = [];
  if (usage.materialsInStock > 0) reasons.push("it holds stock");
  if (usage.openMaterialRequests > 0)
    reasons.push("it has open Material Requests");
  if (usage.undeliveredDeliveryNotes > 0)
    reasons.push("it has Delivery Notes not yet delivered");
  if (usage.undeliveredTransfers > 0)
    reasons.push("it has Material Transfers not yet delivered");
  if (reasons.length > 0)
    throw new DomainError(
      "STORE_IN_USE",
      `This store cannot be deleted: ${reasons.join(", ")}.`,
      { kind: "conflict", details: usage },
    );
}
