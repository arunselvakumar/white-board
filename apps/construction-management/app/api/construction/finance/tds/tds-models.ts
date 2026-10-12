import { z } from "zod";

import type { TdsLedger } from "@/src/finance/application/party-queries";

import { Paise, money, moneyOrNull } from "../parties/party-shared-models";

export const TDS_LEDGER_PATH = "/api/construction/finance/tds";

export const GetConstructionFinanceTdsLedgerRequestModel = z.object({
  contractorId: z.uuid(),
  /** The financial year's start: 2026 for April 2026 – March 2027. */
  fy: z.coerce.number().int().min(2000).max(2100),
});

export const GetConstructionFinanceTdsLedgerResponseModel = z.object({
  contractor: z.object({
    id: z.uuid(),
    name: z.string(),
    pan: z.string().nullable(),
    payeeKind: z.enum(["individual_huf", "other", "no_pan"]),
  }),
  financialYear: z.int(),
  from: z.iso.date(),
  to: z.iso.date(),
  rows: z.array(
    z.object({
      paymentId: z.uuid(),
      number: z.string(),
      paymentDate: z.iso.date(),
      project: z
        .object({ id: z.uuid(), name: z.string().nullable() })
        .nullable(),
      paid: Paise,
      section: z.string().nullable(),
      base: Paise.nullable(),
      rate: z.string().nullable(),
      tds: Paise,
      suggested: Paise.nullable(),
      overridden: z.boolean(),
      overrideReason: z.string().nullable(),
    }),
  ),
  quarters: z.array(
    z.object({
      quarter: z.int().min(1).max(4),
      label: z.string(),
      payments: z.int(),
      base: Paise,
      tds: Paise,
    }),
  ),
  totals: z.object({ base: Paise, tds: Paise, paid: Paise }),
});
export type GetConstructionFinanceTdsLedgerResponse = z.infer<
  typeof GetConstructionFinanceTdsLedgerResponseModel
>;

export function toTdsLedgerResponse(
  ledger: TdsLedger,
): GetConstructionFinanceTdsLedgerResponse {
  return {
    contractor: {
      id: ledger.contractorId,
      name: ledger.contractorName,
      pan: ledger.pan,
      payeeKind: ledger.payeeKind,
    },
    financialYear: ledger.financialYear,
    from: ledger.from,
    to: ledger.to,
    rows: ledger.rows.map((row) => ({
      paymentId: row.paymentId,
      number: row.number,
      paymentDate: row.paymentDate,
      project:
        row.projectId == null
          ? null
          : { id: row.projectId, name: row.projectName },
      paid: money(row.paid),
      section: row.section,
      base: moneyOrNull(row.base),
      rate: row.rate,
      tds: money(row.tds),
      suggested: moneyOrNull(row.suggested),
      overridden: row.overridden,
      overrideReason: row.overrideReason,
    })),
    quarters: ledger.quarters.map((quarter) => ({
      ...quarter,
      base: money(quarter.base),
      tds: money(quarter.tds),
    })),
    totals: {
      base: money(ledger.totals.base),
      tds: money(ledger.totals.tds),
      paid: money(ledger.totals.paid),
    },
  };
}
