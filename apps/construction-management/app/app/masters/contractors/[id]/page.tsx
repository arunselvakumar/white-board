import type { Metadata } from "next";

import { PartyFormSkeleton } from "@/components/parties/parties-skeletons";
import { EditPartyScreen } from "@/components/parties/party-form";
import { PARTY_SCREENS } from "@/components/parties/party-screens";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Contractor" };

export default async function EditContractorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense
      fallback={<PartyFormSkeleton screen={PARTY_SCREENS.contractors} />}
    >
      <EditPartyScreen list="contractors" id={id} />
    </QuerySuspense>
  );
}
