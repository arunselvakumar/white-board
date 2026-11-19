import type { Metadata } from "next";
import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { CompanyDashboard } from "@/app/app/dashboard/_components/company-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The Company Dashboard, behind the Dashboard menu's Read flag;
 * the route answers 403 without it, and the main menu hides the link.
 */
export default async function CompanyDashboardPage() {
  if (!(await viewerCan("reporting.project_dashboard", "read")))
    return (
      <div className="w-full p-6">
        <EmptyState
          icon={LockSimpleIcon}
          tone="neutral"
          orbit={false}
          title="No access to the Dashboard"
          description="Ask the Owner to give you the Dashboard permission in your Permission Matrix."
          className="bg-card max-w-4xl border"
        />
      </div>
    );
  return <CompanyDashboard />;
}
