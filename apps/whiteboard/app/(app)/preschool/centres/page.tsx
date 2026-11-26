import type { Metadata } from "next";

import { CentresScreen } from "@/app/(app)/preschool/centres/_components/centres-screen";

export const metadata: Metadata = { title: "Centres" };

export default function CentresPage() {
  return <CentresScreen />;
}
