import type { ContractorTdsEstimator } from "@/src/contracts/application/contractor-bill-ports";
import type { PartyInvoicing } from "@/src/contracts/application/ports";
import { payeeKindOf, rateInForce, tdsOn } from "@/src/finance/domain/tds";
import type { PartyFinance } from "@/src/finance/infrastructure/party-finance-factory";
import { loadTdsRates } from "@/src/finance/infrastructure/tds-rate-store";

import { financeDirectory } from "./finance-directory";
import { partyFinance } from "./party-finance";

/**
 * How an approved RA bill becomes a finance invoice (ADR CM-0023 §7),
 * through finance's own `RaBillInvoices` inside the bill's transaction:
 * contracts never writes finance tables. Contractor Bills (CM-1106) are
 * payable invoices from the Contractor; Client Bills (CM-1107) are
 * receivable invoices to the Client (party type `client`).
 */
export function contractsPartyInvoicing(
  finance: () => PartyFinance = partyFinance,
): PartyInvoicing {
  return {
    async create(tx, draft) {
      const expected =
        draft.partyType === "contractor" ? "payable" : "receivable";
      if (draft.direction !== expected)
        throw new Error(
          `A ${draft.partyType === "contractor" ? "Contractor" : "Client"} Bill's invoice is ${expected}.`,
        );
      return finance().raBills.create(tx, {
        workspaceId: draft.workspaceId,
        by: draft.by,
        partyType: draft.partyType,
        partyId: draft.partyId,
        projectId: draft.projectId,
        departmentId: draft.departmentId,
        number: draft.number,
        date: draft.date,
        taxable: draft.taxable,
        gst: draft.gst,
        amount: draft.amount,
        billId: draft.sourceId,
      });
    },
    isSettled(tx, input) {
      return finance().raBills.isSettled(
        tx,
        input.workspaceId,
        input.invoiceId,
      );
    },
    reverse(tx, input) {
      return finance().raBills.reverse(tx, input);
    },
  };
}

/**
 * The TDS a Contractor Bill's payment would likely suffer, for the bill
 * page and PDF (ADR CM-0023 §7): the gross × the 194C rate in force on the
 * bill date for the Contractor's payee kind (or its lower-deduction
 * certificate's), rounded to the rupee. Thresholds and the year's earlier
 * payments are left out: finance works out the real figure at payment
 * (CM-0017 §8). CM-1116 brings the other TDS natures.
 */
export const contractorTdsEstimate: ContractorTdsEstimator = async (
  db,
  input,
) => {
  const contractor = (
    await financeDirectory.contractors(db, input.workspaceId, [
      input.contractorId,
    ])
  ).get(input.contractorId);
  if (contractor == null) return null;
  const rate = rateInForce(
    await loadTdsRates(db),
    "194C",
    payeeKindOf(contractor.pan),
    input.date,
  );
  if (rate == null) return null;
  const percent = contractor.tdsLowerRate ?? rate.rate;
  return {
    label: rate.label,
    rate: percent,
    applicable: contractor.tdsApplicable,
    base: input.base,
    amount: contractor.tdsApplicable ? tdsOn(input.base, percent) : 0n,
  };
};
