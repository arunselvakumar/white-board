import type { Metadata } from "next";

import { DownloadsPage } from "@/app/app/downloads/_components/downloads-page";
import { DownloadsPageSkeleton } from "@/app/app/downloads/_components/downloads-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Downloads" };

/** The member's reports across Projects, from the user menu. */
export default function Downloads() {
  return (
    <QuerySuspense fallback={<DownloadsPageSkeleton />}>
      <DownloadsPage />
    </QuerySuspense>
  );
}
