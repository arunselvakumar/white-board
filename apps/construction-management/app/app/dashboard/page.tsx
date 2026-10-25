import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { CompanyDashboard } from "@/components/dashboard/company-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The Company Dashboard (CM-902), behind the Dashboard menu's Read flag;
 * the route answers 403 without it, and the main menu hides the link.
 */
export default async function CompanyDashboardPage() {
  if (!(await viewerCan("reporting.project_dashboard", "read")))
    return (
      <div className="w-full p-6">
        <Empty className="bg-card max-w-4xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutDashboard />
            </EmptyMedia>
            <EmptyTitle>No access to the Dashboard</EmptyTitle>
            <EmptyDescription>
              Ask the Owner to give you the Dashboard permission in your
              Permission Matrix.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  return <CompanyDashboard />;
}
