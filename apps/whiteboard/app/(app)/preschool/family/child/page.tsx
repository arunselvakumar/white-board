import type { Metadata } from "next";

import { FamilyChildScreen } from "@/app/(app)/preschool/family/child/_components/family-child-screen";

export const metadata: Metadata = { title: "Child's details" };

export default function FamilyChildPage() {
  return <FamilyChildScreen />;
}
