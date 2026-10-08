import { protectCompany } from "@repo/auth/construction/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const auth = await protectCompany();
  if (auth.workspaceId == null) redirect("/continue");

  return (
    <AppShell>
      <QuerySuspense>{children}</QuerySuspense>
    </AppShell>
  );
}
