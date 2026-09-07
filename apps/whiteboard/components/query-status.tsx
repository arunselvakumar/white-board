"use client";

import { useQuery } from "@tanstack/react-query";

async function getWorkspaceStatus(): Promise<{ status: "ready" }> {
  return Promise.resolve({ status: "ready" });
}

export function QueryStatus() {
  const { data, isPending } = useQuery({
    queryKey: ["workspace-status"],
    queryFn: getWorkspaceStatus,
  });

  return (
    <p className="text-muted-foreground font-mono text-xs">
      Query: {isPending ? "loading" : data?.status}
    </p>
  );
}
