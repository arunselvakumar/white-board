import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { QuerySuspense } from "@/components/query-suspense";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await auth.protect();

  return (
    <WorkspaceGate>
      <AppShell>
        <QuerySuspense>{children}</QuerySuspense>
      </AppShell>
    </WorkspaceGate>
  );
}
