import type { Metadata } from "next";

import { FeeStructuresScreen } from "@/app/(app)/preschool/fees/structures/_components/fee-structures-screen";

export const metadata: Metadata = { title: "Fee Structures" };

export default function FeeStructuresPage() {
  return <FeeStructuresScreen />;
}
