import { z } from "zod";

import type { OpeningView } from "@/src/finance/application/party-opening-handlers";

import { Paise, PartyTypeModel, money } from "../parties/party-shared-models";

export const PARTY_OPENINGS_PATH = "/api/construction/finance/party-openings";

export const SetConstructionFinancePartyOpeningRequestModel = z.object({
  partyType: PartyTypeModel,
  partyId: z.uuid(),
  projectId: z.uuid().nullable().optional(),
  storeId: z.uuid().nullable().optional(),
  /** The date the balance stood at. */
  asOfDate: z.iso.date(),
  /** Paise, not zero: + owed to the party, − an advance already with them. */
  amount: Paise.refine((value) => value !== 0, "Enter an amount other than 0."),
  /** Required to change an existing opening (409 `PARTY_OPENING_EXISTS` without it). */
  expectedUpdatedAt: z.iso.datetime().nullable().optional(),
});
export type SetConstructionFinancePartyOpeningRequestModel = z.input<
  typeof SetConstructionFinancePartyOpeningRequestModel
>;

export const DeleteConstructionFinancePartyOpeningRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ListConstructionFinancePartyOpeningsRequestModel = z.object({
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  partyType: PartyTypeModel,
});

export const ConstructionFinancePartyOpeningResponseModel = z.object({
  id: z.uuid(),
  party: z.object({
    type: PartyTypeModel,
    id: z.uuid(),
    name: z.string().nullable(),
  }),
  place: z.object({ kind: z.enum(["project", "store"]), id: z.uuid() }),
  asOfDate: z.iso.date(),
  amount: Paise,
  updatedAt: z.iso.datetime(),
});
export type ConstructionFinancePartyOpeningResponse = z.infer<
  typeof ConstructionFinancePartyOpeningResponseModel
>;

export const ListConstructionFinancePartyOpeningsResponseModel = z.object({
  items: z.array(ConstructionFinancePartyOpeningResponseModel),
});
export type ListConstructionFinancePartyOpeningsResponse = z.infer<
  typeof ListConstructionFinancePartyOpeningsResponseModel
>;

export function toOpeningResponse(
  view: OpeningView,
): ConstructionFinancePartyOpeningResponse {
  return {
    id: view.id,
    party: { type: view.partyType, id: view.partyId, name: view.partyName },
    place: view.place,
    asOfDate: view.asOfDate,
    amount: money(view.amount),
    updatedAt: view.updatedAt.toISOString(),
  };
}
