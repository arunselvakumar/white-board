import { assertAccountUsable } from "@/src/finance/domain/accounts";
import { lockedAccountFacts } from "@/src/finance/infrastructure/account-facts";
import { accountLedger } from "@/src/finance/infrastructure/account-ledger";
import type { AccountPosting } from "@/src/shared-kernel/account-posting";

import { financeDirectory } from "./finance-directory";

/**
 * Labour's wage payments and HRMS's Paid salary slips on finance's account
 * ledger (ADR CM-0017 §12), inside the caller's transaction. Labour and HRMS
 * record Cash or Bank: Cash takes a Cash or petty-cash account, Bank a Bank
 * account.
 */
export const accountPosting: AccountPosting = {
  async postPayment(tx, input) {
    const account = await lockedAccountFacts(
      tx,
      financeDirectory,
      input.workspaceId,
      input.accountId,
    );
    assertAccountUsable(
      account,
      input.mode === "cash" ? "cash" : "online",
      input.actor,
    );
    await accountLedger.post(tx, input.workspaceId, input.by, [
      {
        accountId: account.id,
        projectId: input.projectId,
        entryDate: input.entryDate,
        kind: "payment",
        amount: -input.amount,
        mode: input.mode === "cash" ? "cash" : null,
        reference: input.reference,
        counterpartyKind: input.counterparty.kind,
        counterpartyId: input.counterparty.id,
        counterpartyName: input.counterparty.name,
        narration: input.narration,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    ]);
  },

  async reverse(tx, input) {
    await accountLedger.reverseSource(
      tx,
      input.workspaceId,
      input.by,
      input.sourceType,
      input.sourceId,
    );
  },
};
