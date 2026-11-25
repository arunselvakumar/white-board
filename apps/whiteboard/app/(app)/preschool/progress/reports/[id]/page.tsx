import type { Metadata } from "next";

import { ProgressReportScreen } from "@/app/(app)/preschool/progress/reports/[id]/_components/progress-report-screen";

export const metadata: Metadata = { title: "Progress Report" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProgressReportScreen reportId={id} />;
}
