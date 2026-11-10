import type { Metadata } from "next";

import { BackdatedEntryForm } from "@/app/app/settings/backdated-entry/_components/backdated-entry-form";
import { BackdatedEntrySkeleton } from "@/app/app/settings/_components/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Back-dated Entry" };

export default function BackdatedEntryPage() {
  return (
    <QuerySuspense fallback={<BackdatedEntrySkeleton />}>
      <BackdatedEntryForm />
    </QuerySuspense>
  );
}
