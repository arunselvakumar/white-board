import { z } from "zod";

import { PARTY_TYPES } from "@/src/finance/domain/party";

/** Shared pieces of the party money models (CM-705, CM-706, CM-708). */

export const PartyTypeModel = z.enum(PARTY_TYPES);
export const PaymentModeModel = z.enum(["cash", "cheque", "online", "upi"]);
export const InvoiceDirectionModel = z.enum(["payable", "receivable"]);
export const PaymentDirectionModel = z.enum(["out", "in"]);

/** Paise as a safe integer (₹1 = 100). */
export const Paise = z.int();

/** A Project, or a Store for a store Supplier (Owner only). */
export const PlaceQuery = z.object({
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
});

export const ConstructionFinancePartyPlaceResponseModel = z.object({
  kind: z.enum(["project", "store"]),
  id: z.uuid(),
  name: z.string().nullable(),
});

export const ConstructionFinancePartyRefResponseModel = z.object({
  type: PartyTypeModel,
  id: z.uuid(),
  name: z.string().nullable(),
});

export const ConstructionFinancePartyIdParamsModel = z.object({
  id: z.uuid(),
});

export const pageQuery = {
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  after: z.string().min(1).optional(),
  before: z.string().min(1).optional(),
};

export function placeResponse(
  place: { kind: "project" | "store"; id: string },
  name: string | null,
) {
  return { kind: place.kind, id: place.id, name };
}

export const money = (value: bigint): number => Number(value);
export const moneyOrNull = (value: bigint | null): number | null =>
  value == null ? null : Number(value);
