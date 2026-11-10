import type { Metadata } from "next";

import { EditOtherPartyScreen } from "@/app/app/masters/other-parties/_components/other-party-form";

export const metadata: Metadata = { title: "Edit Other Party" };

export default async function EditOtherPartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditOtherPartyScreen id={id} />;
}
