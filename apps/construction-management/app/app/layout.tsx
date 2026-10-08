import { protectCompany } from "@repo/auth/construction/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await protectCompany();

  return (
    <AppShell>
      <QuerySuspense>{children}</QuerySuspense>
    </AppShell>
  );
}
