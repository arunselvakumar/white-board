import type { Metadata } from "next";

import { CompanyProfileScreen } from "@/components/company-profile/company-profile-screen";
import { CompanyProfileSkeleton } from "@/components/company-profile/company-profile-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <QuerySuspense fallback={<CompanyProfileSkeleton />}>
      <CompanyProfileScreen />
    </QuerySuspense>
  );
}
