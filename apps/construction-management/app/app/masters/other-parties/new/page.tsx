import type { Metadata } from "next";

import { NewOtherPartyScreen } from "@/app/app/masters/other-parties/_components/other-party-form";

export const metadata: Metadata = { title: "Add Other Party" };

export default function NewOtherPartyPage() {
  return <NewOtherPartyScreen />;
}
