import type { Metadata } from "next";

import { FamilyProgressScreen } from "@/app/(app)/preschool/family/progress/_components/family-progress-screen";

export const metadata: Metadata = { title: "Progress" };

export default function FamilyProgressPage() {
  return <FamilyProgressScreen />;
}
