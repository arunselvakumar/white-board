import type { Metadata } from "next";

import { NewOtherPartyScreen } from "@/components/finance/other-parties/other-party-form";

export const metadata: Metadata = { title: "Add Other Party" };

export default function NewOtherPartyPage() {
  return <NewOtherPartyScreen />;
}
