import { protectCompany } from "@repo/auth/construction/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import {
  CHANGE_PASSWORD_PATH,
  mustChangePassword,
} from "@/lib/must-change-password";

import { viewerCan } from "./_lib/viewer-can";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const auth = await protectCompany();
  // A Temporary Password is replaced before anything else (ADR CM-0029 §8).
  if (mustChangePassword(auth)) redirect(CHANGE_PASSWORD_PATH);
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
