import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { CompanyProfileScreen } from "@/app/app/settings/_components/company-profile-screen";
import { GET as readCompanyProfile } from "@/app/api/construction/organization/company-profile/route";
import {
  COMPANY_PROFILE_API,
  companyProfileQuery,
} from "@/src/queries/company-profile";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";

export const metadata: Metadata = { title: "Settings" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const queryClient = getQueryClient();
  await prefetchRoute(queryClient, companyProfileQuery, {
    [COMPANY_PROFILE_API]: readCompanyProfile,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompanyProfileScreen />
    </HydrationBoundary>
  );
}
