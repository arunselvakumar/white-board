import type { Metadata } from "next";

import { BankAccountsList } from "@/app/app/masters/bank-accounts/_components/bank-accounts-list";

export const metadata: Metadata = { title: "Company's Bank A/C" };

export default function BankAccountsPage() {
  return <BankAccountsList />;
}
