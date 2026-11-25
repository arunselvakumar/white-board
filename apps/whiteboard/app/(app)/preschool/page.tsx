import type { Metadata } from "next";

import { CentreDashboardScreen } from "@/app/(app)/preschool/_components/dashboard/centre-dashboard-screen";

export const metadata: Metadata = { title: "Centre Dashboard" };

export default function CentreDashboardPage() {
  return <CentreDashboardScreen />;
}
