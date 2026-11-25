import type { Metadata } from "next";

import { FamilyReportsScreen } from "@/app/(app)/preschool/family/daily-reports/_components/family-reports-screen";

export const metadata: Metadata = { title: "Daily Reports" };

export default function FamilyReportsPage() {
  return <FamilyReportsScreen />;
}
