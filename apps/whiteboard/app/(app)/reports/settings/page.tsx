import type { Metadata } from "next";

import { ReportSettingsScreen } from "@/app/(app)/reports/settings/_components/report-settings-screen";

export const metadata: Metadata = { title: "Report settings" };

export default function ReportSettingsPage() {
  return <ReportSettingsScreen />;
}
