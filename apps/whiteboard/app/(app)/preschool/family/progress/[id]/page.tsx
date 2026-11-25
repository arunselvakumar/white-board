import type { Metadata } from "next";

import { ProgressReportScreen } from "@/app/(app)/preschool/progress/reports/[id]/_components/progress-report-screen";

export const metadata: Metadata = { title: "Progress Report" };

export default async function FamilyProgressReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ child?: string }>;
}) {
  const [{ id }, { child }] = await Promise.all([params, searchParams]);
  return (
    <ProgressReportScreen
      reportId={id}
      back={{
        href: `/preschool/family/progress${child == null ? "" : `?child=${encodeURIComponent(child)}`}`,
        label: "Progress",
      }}
    />
  );
}
