import type { Metadata } from "next";

import { FamilyHomeScreen } from "@/app/(app)/preschool/family/_components/family-home-screen";

export const metadata: Metadata = { title: "Home" };

export default function FamilyHomePage() {
  return <FamilyHomeScreen />;
}
