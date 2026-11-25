import type { Metadata } from "next";

import { HeadOfficeScreen } from "@/app/(app)/preschool/head-office/_components/head-office-screen";

export const metadata: Metadata = { title: "Head Office" };

export default function HeadOfficePage() {
  return <HeadOfficeScreen />;
}
