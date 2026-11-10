import type { Metadata } from "next";

import { BankAccountsList } from "@/app/app/masters/bank-accounts/_components/bank-accounts-list";

export const metadata: Metadata = { title: "Company's Bank A/C" };

/** Masters → Company's Bank A/C (CM-701). */
export default function BankAccountsPage() {
  return <BankAccountsList />;
}
