import type { Metadata } from "next";

import { OtherPartiesPage } from "@/app/app/masters/other-parties/_components/other-parties-page";

export const metadata: Metadata = { title: "Other Parties" };

export default function OtherPartiesMasterPage() {
  return <OtherPartiesPage />;
}
