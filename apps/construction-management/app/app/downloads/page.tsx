import type { Metadata } from "next";

import { DownloadsPage } from "@/components/downloads/downloads-page";
import { DownloadsPageSkeleton } from "@/components/downloads/downloads-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Downloads" };

/** The member's reports across Projects (CM-901), from the user menu. */
export default function Downloads() {
  return (
    <QuerySuspense fallback={<DownloadsPageSkeleton />}>
      <DownloadsPage />
    </QuerySuspense>
  );
}
