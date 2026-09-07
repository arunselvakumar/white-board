import { Button } from "@repo/ui/components/button";

import { QueryStatus } from "@/components/query-status";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-md flex-col gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Whiteboard</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Application workspace. Shared UI comes from{" "}
          <code className="font-mono text-xs">@repo/ui</code>. Data fetching is
          wired through TanStack Query.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button>Open board</Button>
        <QueryStatus />
      </div>
    </main>
  );
}
