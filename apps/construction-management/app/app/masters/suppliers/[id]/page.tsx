import type { Metadata } from "next";

import { EditPartyScreen } from "@/components/parties/party-form";

export const metadata: Metadata = { title: "Edit Supplier" };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditPartyScreen list="suppliers" id={id} />;
}
