import type { Metadata } from "next";

import { OwnerDashboardScreen } from "@/components/dashboard/owner-dashboard-screen";

export const metadata: Metadata = { title: "Owner Dashboard" };

export default function OwnerDashboardPage() {
  return <OwnerDashboardScreen />;
}
