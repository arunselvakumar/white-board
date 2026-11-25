import type { Metadata } from "next";

import { FamilyFeesScreen } from "@/app/(app)/preschool/family/fees/_components/family-fees-screen";

export const metadata: Metadata = { title: "Fees" };

export default function FamilyFeesPage() {
  return <FamilyFeesScreen />;
}
