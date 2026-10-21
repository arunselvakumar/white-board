import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { paise } from "./item-analysis";

/**
 * An Item of the Company's Item Library (CM-1102, ADR CM-0023 §3): a code
 * and description as a schedule prints it ("CPWD DSR 2023" 5.1.1), its UoM,
 * SAC or HSN code and the **adopted rate** the Company uses. BOQ items are
 * copied from it (CM-1103). The optional rate analysis is in
 * `item-analysis.ts`.
 */

export const ITEM_CODE_MAX = 32;
export const ITEM_SHORT_DESCRIPTION_MAX = 200;
export const ITEM_DESCRIPTION_MAX = 4000;
export const ITEM_SCHEDULE_MAX = 80;

/** SAC (services) or HSN (goods): 4 to 8 digits. */
const SAC_HSN = /^\d{4,8}$/;

export function isValidSacHsn(raw: string): boolean {
  return SAC_HSN.test(raw.trim());
}

export type ItemInput = {
  code: string;
  shortDescription: string;
  description?: string | null;
  uomId: string;
  sacHsn?: string | null;
  schedule?: string | null;
  /** Paise per UoM. */
  adoptedRate: number | bigint;
};

export type ItemFields = {
  /** Trimmed; unique in the Company ignoring case. */
  code: string;
  shortDescription: string;
  description: string | null;
  uomId: string;
  sacHsn: string | null;
  schedule: string | null;
  adoptedRate: bigint;
};

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function oneLine(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

/** Checks and tidies an Item's own fields (not its rate analysis). */
export function itemFields(input: ItemInput): ItemFields {
  const code = oneLine(input.code);
  if (code == null)
    throw field("ITEM_CODE_REQUIRED", "Enter the Item's code.", "code");
  if (code.length > ITEM_CODE_MAX)
    throw field(
      "ITEM_CODE_TOO_LONG",
      `The code is at most ${String(ITEM_CODE_MAX)} characters.`,
      "code",
    );

  const shortDescription = oneLine(input.shortDescription);
  if (shortDescription == null)
    throw field(
      "ITEM_SHORT_DESCRIPTION_REQUIRED",
      "Enter a short description.",
      "shortDescription",
    );
  if (shortDescription.length > ITEM_SHORT_DESCRIPTION_MAX)
    throw field(
      "ITEM_SHORT_DESCRIPTION_TOO_LONG",
      `The short description is at most ${String(ITEM_SHORT_DESCRIPTION_MAX)} characters.`,
      "shortDescription",
    );

  // The long description keeps its line breaks (a schedule's wording).
  const longText = input.description?.trim() ?? "";
  const description = longText === "" ? null : longText;
  if (description != null && description.length > ITEM_DESCRIPTION_MAX)
    throw field(
      "ITEM_DESCRIPTION_TOO_LONG",
      `The description is at most ${ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters.`,
      "description",
    );

  const uomId = input.uomId.trim();
  if (uomId === "")
    throw field("ITEM_UOM_REQUIRED", "Pick the Item's UoM.", "uomId");

  const sacHsn = oneLine(input.sacHsn)?.replace(/\s/g, "") ?? null;
  if (sacHsn != null && !isValidSacHsn(sacHsn))
    throw field(
      "SAC_HSN_INVALID",
      "The SAC or HSN code is 4 to 8 digits.",
      "sacHsn",
    );

  const schedule = oneLine(input.schedule);
  if (schedule != null && schedule.length > ITEM_SCHEDULE_MAX)
    throw field(
      "ITEM_SCHEDULE_TOO_LONG",
      `The schedule is at most ${String(ITEM_SCHEDULE_MAX)} characters.`,
      "schedule",
    );

  const adoptedRate = paise(input.adoptedRate);
  if (adoptedRate == null)
    throw field(
      "ITEM_RATE_INVALID",
      "The adopted rate is an amount from ₹0 to ₹1,000 crore.",
      "adoptedRate",
    );

  return {
    code,
    shortDescription,
    description,
    uomId,
    sacHsn,
    schedule,
    adoptedRate,
  };
}

export const itemNotFound = () =>
  notFound("ITEM_NOT_FOUND", "This Item was not found.");

export const itemCodeTaken = (code: string) =>
  conflict(
    "ITEM_CODE_TAKEN",
    `An Item with the code “${code}” is already in the library.`,
    { field: "code" },
  );

export const itemChanged = () =>
  conflict(
    "ITEM_CHANGED",
    "Someone changed this Item after you opened it. Reload to see the latest.",
  );

/** A live BOQ item was copied from it (ADR CM-0023 §3). */
export const itemInUse = (count: number) =>
  conflict(
    "ITEM_IN_USE",
    count === 1
      ? "A BOQ item uses this Item, so it cannot be deleted."
      : `${String(count)} BOQ items use this Item, so it cannot be deleted.`,
    { count },
  );

/** The UoM is not one of the Company's, or was disabled and is newly picked. */
export const itemUomInvalid = () =>
  field(
    "ITEM_UOM_INVALID",
    "Pick a UoM from Master records → Measurement Units.",
    "uomId",
  );
