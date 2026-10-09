import type { Metadata } from "next";

import { ReportsPage } from "@/components/reports/reports-page";

export const metadata: Metadata = { title: "Reports" };

/** The Project's labour and vendor reports (CM-217, CM-218). */
export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-6xl p-4 sm:p-6">
      <ReportsPage projectId={id} />
    </div>
  );
}
