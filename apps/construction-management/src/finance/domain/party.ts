import { DomainError } from "@/src/shared-kernel/domain-error";

import type { PartyType } from "./ledger";

/**
 * The parties whose balances finance keeps (ADR CM-0017 §7): Contractors,
 * Suppliers and Clients (masters; Clients from CM-1107) and Other Parties
 * (finance). One engine serves all four; only the rules below differ by
 * type.
 */
export const PARTY_TYPES = [
  "contractor",
  "supplier",
  "other_party",
  "client",
] as const;

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  contractor: "Contractor",
  supplier: "Supplier",
  other_party: "Other Party",
  client: "Client",
};

/**
 * Where a party's balance lives: a Project, or a Store for a Supplier of a
 * Central Store (CM-0017 §7). Store-located documents are Owner-only in M7
 * (§14).
 */
export type PartyPlace =
  { kind: "project"; id: string } | { kind: "store"; id: string };

export function placeOf(row: {
  projectId: string | null;
  storeId: string | null;
}): PartyPlace {
  if (row.projectId != null) return { kind: "project", id: row.projectId };
  if (row.storeId != null) return { kind: "store", id: row.storeId };
  throw new Error("A party document names a Project or a Store.");
}

export function placeColumns(place: PartyPlace): {
  projectId: string | null;
  storeId: string | null;
} {
  return place.kind === "project"
    ? { projectId: place.id, storeId: null }
    : { projectId: null, storeId: place.id };
}

export function samePlace(a: PartyPlace, b: PartyPlace): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Exactly one of `projectId` and `storeId`; a Store only for a Supplier. */
export function placeFromInput(
  partyType: PartyType,
  input: { projectId?: string | null; storeId?: string | null },
): PartyPlace {
  const projectId = input.projectId ?? null;
  const storeId = input.storeId ?? null;
  if ((projectId == null) === (storeId == null))
    throw new DomainError(
      "PLACE_REQUIRED",
      "Choose a Project (or a Store for a store Supplier).",
      { details: { field: "projectId" } },
    );
  if (storeId != null) {
    if (partyType !== "supplier")
      throw new DomainError(
        "STORE_ONLY_FOR_SUPPLIERS",
        "Only a Supplier's documents can belong to a Store.",
        { details: { field: "storeId" } },
      );
    return { kind: "store", id: storeId };
  }
  return { kind: "project", id: projectId ?? "" };
}

/** What finance knows about a party when it posts to its balance. */
export type PartyFacts = {
  type: PartyType;
  id: string;
  name: string;
  pan: string | null;
  /** Projects it is assigned to; Other Parties carry theirs too. */
  projectIds: readonly string[];
  /** A Contractor's Departments; empty otherwise. */
  departmentIds: readonly string[];
};

/**
 * Contractors and Suppliers must be assigned to the Project (Resources)
 * before money is recorded for them there (CM-705); a Client must be the
 * Client the Project links (CM-1107). Other Parties and Store suppliers are
 * not checked.
 */
export function assertPartyOnPlace(party: PartyFacts, place: PartyPlace): void {
  if (party.type === "other_party" || place.kind === "store") return;
  if (party.type === "client") {
    if (!party.projectIds.includes(place.id))
      throw new DomainError(
        "PARTY_NOT_ON_PROJECT",
        "This Client is not the Project's Client. Pick it on the Project first.",
        { details: { field: "partyId" } },
      );
    return;
  }
  if (!party.projectIds.includes(place.id))
    throw new DomainError(
      "PARTY_NOT_ON_PROJECT",
      `This ${PARTY_TYPE_LABELS[party.type]} is not assigned to the Project. Add them under the Project's Resources first.`,
      { details: { field: "partyId" } },
    );
}

export const PARTY_TEXT_LIMITS = {
  invoiceNumber: 60,
  remarks: 500,
  reason: 500,
  reference: 60,
} as const;

/** Trimmed text, empty is null, at most `max`. */
export function optionalText(
  raw: string | null | undefined,
  field: string,
  max: number,
): string | null {
  const text = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (text.length > max)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      { details: { field } },
    );
  return text === "" ? null : text;
}

/** Paise from JSON: a safe integer, positive unless `allowZero`. */
export function paiseFrom(
  raw: number,
  field: string,
  options: { allowZero?: boolean; allowNegative?: boolean } = {},
): bigint {
  if (!Number.isSafeInteger(raw))
    throw new DomainError("AMOUNT_INVALID", "Enter an amount in rupees.", {
      details: { field },
    });
  if (raw < 0 && options.allowNegative !== true)
    throw new DomainError("AMOUNT_INVALID", "Enter an amount of 0 or more.", {
      details: { field },
    });
  if (raw === 0 && options.allowZero !== true)
    throw new DomainError("AMOUNT_INVALID", "Enter an amount above zero.", {
      details: { field },
    });
  return BigInt(raw);
}
