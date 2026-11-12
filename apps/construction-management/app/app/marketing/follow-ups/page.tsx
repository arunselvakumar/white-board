import type { Metadata } from "next";

import { MarketingSectionPage } from "../_components/marketing-section-page";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Page() {
  return <MarketingSectionPage section="followUps" />;
}
