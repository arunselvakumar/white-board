import type { Metadata } from "next";

import { AccountLedger } from "@/app/app/masters/bank-accounts/[accountId]/_components/account-ledger";

export const metadata: Metadata = { title: "Account Ledger" };

/** One company account's Ledger (CM-701). */
export default async function BankAccountLedgerPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return (
    <AccountLedger
      accountId={accountId}
      back={{ label: "Company's Bank A/C", href: "/app/masters/bank-accounts" }}
    />
  );
}
