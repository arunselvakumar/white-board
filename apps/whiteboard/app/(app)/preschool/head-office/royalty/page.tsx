import type { Metadata } from "next";

import { RoyaltyScreen } from "@/app/(app)/preschool/head-office/royalty/_components/royalty-screen";

export const metadata: Metadata = { title: "Royalty Statement" };

export default function RoyaltyPage() {
  return <RoyaltyScreen />;
}
