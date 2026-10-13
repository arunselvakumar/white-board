import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReportScreen } from "@/components/reports/report-screen";
import {
  isReportKey,
  reportDefinition,
} from "@/src/training-institute/domain/report-catalogue";

type ReportPageProps = { params: Promise<{ report: string }> };

export async function generateMetadata({
  params,
}: ReportPageProps): Promise<Metadata> {
  const { report } = await params;
  return {
    title: isReportKey(report) ? reportDefinition(report).title : "Reports",
  };
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { report } = await params;
  if (!isReportKey(report)) notFound();
  return <ReportScreen reportKey={report} />;
}
