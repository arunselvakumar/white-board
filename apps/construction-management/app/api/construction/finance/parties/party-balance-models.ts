import { z } from "zod";

import type {
  PartyBalanceRow,
  PartyBalances,
} from "@/src/finance/application/party-queries";

import { Paise, PartyTypeModel, money } from "./party-shared-models";

export const PARTIES_PATH = "/api/construction/finance/parties";

export const ListConstructionFinancePartyBalancesRequestModel = z.object({
  partyType: PartyTypeModel,
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
});

const Figures = {
  opening: Paise,
  /** Bills from the party. */
  invoiced: Paise,
  /** Sales invoices to the party (Other Parties) and Client Bills' invoices (Clients). */
  billed: Paise,
  paid: Paise,
  received: Paise,
  tds: Paise,
  /** Clients (CM-1107): income-tax TDS the Client deducted from receipts, the TDS receivable. */
  clientTds: Paise,
  /** Clients: GST-TDS (s.51) the Client deducted from receipts, the GST-TDS receivable. */
  gstTds: Paise,
  /**
   * Clients: retention held back on approved Client Bills less releases,
   * derived in contracts; not part of `balance`. 0 for other parties.
   */
  retentionReceivable: Paise,
  /** Signed as posted: − on bills, + on sales invoices. */
  writtenOff: Paise,
  /** + the Company owes the party; − the party owes the Company. */
  balance: Paise,
  overdue: Paise,
  /** Paid + TDS not yet allocated to an invoice. */
  advance: Paise,
};

export const ConstructionFinancePartyBalanceResponseModel = z.object({
  party: z.object({
    type: PartyTypeModel,
    id: z.uuid(),
    name: z.string().nullable(),
  }),
  /** Assigned to the Project now. */
  assigned: z.boolean(),
  ...Figures,
});

export const ListConstructionFinancePartyBalancesResponseModel = z.object({
  partyType: PartyTypeModel,
  items: z.array(ConstructionFinancePartyBalanceResponseModel),
  totals: z.object(Figures),
});
export type ListConstructionFinancePartyBalancesResponse = z.infer<
  typeof ListConstructionFinancePartyBalancesResponseModel
>;

function figures(
  row: Omit<
    PartyBalanceRow,
    "partyType" | "partyId" | "partyName" | "assigned"
  >,
) {
  return {
    opening: money(row.opening),
    invoiced: money(row.invoiced),
    billed: money(row.billed),
    paid: money(row.paid),
    received: money(row.received),
    tds: money(row.tds),
    clientTds: money(row.clientTds),
    gstTds: money(row.gstTds),
    retentionReceivable: money(row.retentionReceivable),
    writtenOff: money(row.writtenOff),
    balance: money(row.balance),
    overdue: money(row.overdue),
    advance: money(row.advance),
  };
}

export function toPartyBalancesResponse(
  balances: PartyBalances,
): ListConstructionFinancePartyBalancesResponse {
  return {
    partyType: balances.partyType,
    items: balances.rows.map((row) => ({
      party: { type: row.partyType, id: row.partyId, name: row.partyName },
      assigned: row.assigned,
      ...figures(row),
    })),
    totals: figures(balances.totals),
  };
}

export const GetConstructionFinancePartyFormOptionsRequestModel = z.object({
  partyType: PartyTypeModel,
  partyId: z.uuid(),
  projectId: z.uuid().optional(),
  storeId: z.uuid().optional(),
});

export const GetConstructionFinancePartyFormOptionsResponseModel = z.object({
  /** A Contractor's Departments, for its invoices. */
  departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type GetConstructionFinancePartyFormOptionsResponse = z.infer<
  typeof GetConstructionFinancePartyFormOptionsResponseModel
>;
