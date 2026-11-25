import type { Metadata } from "next";

import { DailyReportsScreen } from "@/app/(app)/preschool/daily-reports/_components/daily-reports-screen";

export const metadata: Metadata = { title: "Daily Reports" };

export default function DailyReportsPage() {
  return <DailyReportsScreen />;
}
