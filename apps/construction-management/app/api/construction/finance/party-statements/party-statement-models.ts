import { z } from "zod";

import type { PartyStatement } from "@/src/finance/application/party-queries";

import { ConstructionFinanceInvoiceResponseModel } from "../invoices/invoice-models";
import {
  ConstructionFinancePartyPlaceResponseModel,
  ConstructionFinancePartyRefResponseModel,
  Paise,
  PartyTypeModel,
  money,
  placeResponse,
} from "../parties/party-shared-models";

export const PARTY_STATEMENTS_PATH =
  "/api/construction/finance/party-statements";

export const GetConstructionFinancePartyStatementRequestModel = z.object({
  partyType: PartyTypeModel,
  partyId: z.uuid(),
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  /** Entries from this date; the balance before it is the opening. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const GetConstructionFinancePartyStatementResponseModel = z.object({
  party: ConstructionFinancePartyRefResponseModel,
  place: ConstructionFinancePartyPlaceResponseModel,
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
  /** Paise, + the Company owes the party. */
  opening: Paise,
  lines: z.array(
    z.object({
      id: z.uuid(),
      entryDate: z.iso.date(),
      kind: z.enum([
        "opening",
        "invoice",
        "sales_invoice",
        "payment",
        "receipt",
        "tds",
        "write_off",
      ]),
      amount: Paise,
      balance: Paise,
      document: z.object({
        type: z.enum([
          "invoice",
          "party_payment",
          "party_opening",
          "settlement",
        ]),
        id: z.uuid(),
        number: z.string().nullable(),
      }),
    }),
  ),
  closing: Paise,
  openInvoices: z.array(ConstructionFinanceInvoiceResponseModel),
});
export type GetConstructionFinancePartyStatementResponse = z.infer<
  typeof GetConstructionFinancePartyStatementResponseModel
>;

export function toStatementResponse(
  statement: PartyStatement,
  openInvoices: GetConstructionFinancePartyStatementResponse["openInvoices"],
): GetConstructionFinancePartyStatementResponse {
  return {
    party: {
      type: statement.partyType,
      id: statement.partyId,
      name: statement.partyName,
    },
    place: placeResponse(statement.place, statement.placeName),
    from: statement.from,
    to: statement.to,
    opening: money(statement.opening),
    lines: statement.lines.map((line) => ({
      ...line,
      amount: money(line.amount),
      balance: money(line.balance),
    })),
    closing: money(statement.closing),
    openInvoices,
  };
}
