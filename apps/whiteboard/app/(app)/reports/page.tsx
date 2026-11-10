import type { Metadata } from "next";

import { ReportsCatalogueScreen } from "@/app/(app)/reports/_components/reports-catalogue";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsCatalogueScreen />;
}
