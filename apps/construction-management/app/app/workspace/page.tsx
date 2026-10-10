import type { Metadata } from "next";
import { ItemGroup } from "@repo/ui/components/item";

import { PageHeader } from "@/components/app-shell/page-header";
import { HrmsWorkspaceTile } from "@/components/hrms/hrms-workspace-tile";

export const metadata: Metadata = { title: "Workspace" };

/**
 * Work across all Projects (`docs/00-overview.md`). HRMS is the first
 * module, with today's headline numbers (CM-319); Central Store, Central
 * Payment and Central Reports follow.
 */
export default function WorkspacePage() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader title="Workspace" meta="Work across all your Projects." />
        <ItemGroup className="grid gap-3 sm:grid-cols-2">
          <div role="listitem" className="flex">
            <HrmsWorkspaceTile />
          </div>
        </ItemGroup>
        <p className="text-muted-foreground text-sm">
          Central Store, Central Payment and Central Reports will show here as
          they are built.
        </p>
      </div>
    </div>
  );
}
