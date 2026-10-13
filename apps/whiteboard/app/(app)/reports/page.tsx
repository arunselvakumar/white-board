import type { Metadata } from "next";

import { ReportsCatalogueScreen } from "@/components/reports/reports-catalogue";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsCatalogueScreen />;
}
