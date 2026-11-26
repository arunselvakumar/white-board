import type { Metadata } from "next";

import { FeesDeskScreen } from "@/app/(app)/preschool/fees/_components/fees-desk-screen";

export const metadata: Metadata = { title: "Fees" };

export default function FeesPage() {
  return <FeesDeskScreen />;
}
