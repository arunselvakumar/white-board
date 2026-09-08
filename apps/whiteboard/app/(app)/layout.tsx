import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { AuthHeader } from "@/components/auth-header";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await auth.protect();

  return (
    <WorkspaceGate>
      <div className="flex min-h-svh flex-col">
        <AuthHeader />
        {children}
      </div>
    </WorkspaceGate>
  );
}
