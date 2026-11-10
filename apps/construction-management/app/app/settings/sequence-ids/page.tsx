import type { Metadata } from "next";

import { SequenceIdsManager } from "@/app/app/settings/sequence-ids/_components/sequence-ids-manager";
import { SequenceIdsSkeleton } from "@/app/app/settings/_components/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Sequence IDs" };

export default function SequenceIdsPage() {
  return (
    <QuerySuspense fallback={<SequenceIdsSkeleton />}>
      <SequenceIdsManager />
    </QuerySuspense>
  );
}
