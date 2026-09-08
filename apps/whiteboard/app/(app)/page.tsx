import { auth, clerkClient } from "@clerk/nextjs/server";
import { Button } from "@repo/ui/components/button";

import { QueryStatus } from "@/components/query-status";

export default async function Home() {
  const { orgId } = await auth();
  const clerk = await clerkClient();
  const workspace =
    orgId == null
      ? null
      : await clerk.organizations.getOrganization({ organizationId: orgId });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-md flex-col gap-3 text-center">
        <p className="text-muted-foreground text-sm font-light tracking-wide uppercase">
          {workspace?.name ?? "Workspace"}
        </p>
        <h1 className="text-3xl tracking-tight">Whiteboard</h1>
        <p className="text-muted-foreground text-sm leading-relaxed font-light">
          You&apos;re in this workspace. Shared UI comes from{" "}
          <code className="font-mono text-xs">@repo/ui</code>.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button>Open board</Button>
        <QueryStatus />
      </div>
    </main>
  );
}
