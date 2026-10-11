import type { Metadata } from "next";

import { OtherPartiesPage } from "@/components/finance/other-parties/other-parties-page";

export const metadata: Metadata = { title: "Other Parties" };

/** Masters → Other Parties (CM-704). */
export default function OtherPartiesMasterPage() {
  return <OtherPartiesPage />;
}
