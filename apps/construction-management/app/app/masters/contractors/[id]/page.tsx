import type { Metadata } from "next";

import { EditPartyScreen } from "@/components/parties/party-form";

export const metadata: Metadata = { title: "Edit Contractor" };

export default async function EditContractorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditPartyScreen list="contractors" id={id} />;
}
