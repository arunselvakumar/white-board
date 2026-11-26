import type { Metadata } from "next";

import { ProgrammesScreen } from "@/app/(app)/preschool/programmes/_components/programmes-screen";

export const metadata: Metadata = { title: "Programmes" };

export default function ProgrammesPage() {
  return <ProgrammesScreen />;
}
