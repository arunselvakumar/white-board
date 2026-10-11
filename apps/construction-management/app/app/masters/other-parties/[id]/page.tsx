import type { Metadata } from "next";

import { EditOtherPartyScreen } from "@/components/finance/other-parties/other-party-form";

export const metadata: Metadata = { title: "Edit Other Party" };

export default async function EditOtherPartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditOtherPartyScreen id={id} />;
}
