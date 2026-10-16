import { protectCompany } from "@repo/auth/construction/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";

import { viewerCan } from "./_lib/viewer-can";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const auth = await protectCompany();
  if (auth.workspaceId == null) redirect("/continue");
  // The main menu's Dashboard needs the Dashboard menu's Read (CM-902).
  const canOpenDashboard = await viewerCan(
    "reporting.project_dashboard",
    "read",
  );

  return (
    <AppShell canOpenDashboard={canOpenDashboard}>
      <QuerySuspense>{children}</QuerySuspense>
    </AppShell>
  );
}
