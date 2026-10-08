import { Wallet } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";

export const metadata: Metadata = { title: "Payments" };

export default function ProjectPaymentsPage() {
  return (
    <PagePlaceholder
      title="Payments"
      description="Pay labours and vendors and see their balances on this Project. Arrives with CM-216."
      icon={Wallet}
    />
  );
}
