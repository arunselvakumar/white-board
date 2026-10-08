import type { Metadata } from "next";

import { BackdatedEntryForm } from "@/components/settings/backdated-entry-form";

export const metadata: Metadata = { title: "Back-dated Entry" };

export default function BackdatedEntryPage() {
  return <BackdatedEntryForm />;
}
