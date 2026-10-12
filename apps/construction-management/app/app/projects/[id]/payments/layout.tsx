import type { ReactNode } from "react";

import { PaymentsNav } from "@/components/finance/payments-hub/payments-nav";

/** The Payments module of a Project (M2 wages, M7 finance): its tabs, then the tab. */
export default async function PaymentsLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <PaymentsNav projectId={id} />
      {children}
    </div>
  );
}
