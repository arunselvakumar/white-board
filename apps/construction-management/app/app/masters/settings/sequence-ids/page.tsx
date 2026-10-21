import type { Metadata } from "next";

import { SequenceIdsManager } from "@/components/settings/sequence-ids-manager";
import { SequenceIdsSkeleton } from "@/components/settings/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Sequence IDs" };

export default function SequenceIdsPage() {
  return (
    <QuerySuspense fallback={<SequenceIdsSkeleton />}>
      <SequenceIdsManager />
    </QuerySuspense>
  );
}
