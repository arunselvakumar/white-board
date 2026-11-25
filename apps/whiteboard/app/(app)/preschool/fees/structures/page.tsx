import type { Metadata } from "next";

import { PreschoolEmptyPage } from "@/app/(app)/preschool/_components/preschool-empty-page";

export const metadata: Metadata = { title: "Fee Structures" };

export default function Page() {
  return <PreschoolEmptyPage href="/preschool/fees/structures" />;
}
