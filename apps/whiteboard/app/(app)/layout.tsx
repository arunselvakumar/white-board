import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { PageTransition } from "@/components/page-transition";
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
        <PageTransition>
          <QuerySuspense>{children}</QuerySuspense>
        </PageTransition>
      </AppShell>
    </WorkspaceGate>
  );
}
