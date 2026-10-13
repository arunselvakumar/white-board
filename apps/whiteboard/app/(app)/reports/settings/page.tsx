import type { Metadata } from "next";

import { ReportSettingsScreen } from "@/components/reports/report-settings-screen";

export const metadata: Metadata = { title: "Report settings" };

export default function ReportSettingsPage() {
  return <ReportSettingsScreen />;
}
