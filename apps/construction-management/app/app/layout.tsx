import { protectCompany } from "@repo/auth/construction/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/app/app/_components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import {
  CHANGE_PASSWORD_PATH,
  mustChangePassword,
} from "@/lib/must-change-password";

import { mainMenuAccess } from "./_lib/main-menu-access";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const auth = await protectCompany();
  // A Temporary Password is replaced before anything else (ADR CM-0030 §8).
  if (mustChangePassword(auth)) redirect(CHANGE_PASSWORD_PATH);
  if (auth.workspaceId == null) redirect("/continue");
  const { canOpenDashboard, canOpenStaffRoles } = await mainMenuAccess();

  return (
    <AppShell
      canOpenDashboard={canOpenDashboard}
      canOpenStaffRoles={canOpenStaffRoles}
    >
      <QuerySuspense serverFallback={null}>{children}</QuerySuspense>
    </AppShell>
  );
}
