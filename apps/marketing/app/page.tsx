import { Button } from "@repo/ui/components/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-lg flex-col gap-3 text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Whiteboard
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Think together, on one board.
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Marketing site for Whiteboard. Shared components live in{" "}
          <code className="font-mono text-xs">@repo/ui</code>.
        </p>
      </div>
      <Button>Get started</Button>
    </main>
  );
}
