import type { Metadata } from "next";

import { BackdatedEntryForm } from "@/components/settings/backdated-entry-form";
import { BackdatedEntrySkeleton } from "@/components/settings/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Back-dated Entry" };

export default function BackdatedEntryPage() {
  return (
    <QuerySuspense fallback={<BackdatedEntrySkeleton />}>
      <BackdatedEntryForm />
    </QuerySuspense>
  );
}
