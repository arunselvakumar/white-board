import type { Metadata } from "next";

import { FeesScreen } from "@/app/(app)/fees/_components/fees-screen";

export const metadata: Metadata = { title: "Fees" };

export default function FeesPage() {
  return <FeesScreen />;
}
