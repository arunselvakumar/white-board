import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as formOptions } from "@/app/api/construction/marketing/companies/form-options/route";
import { GET as needsReassigning } from "@/app/api/construction/marketing/companies/needs-reassigning/route";
import { GET as listCompanies } from "@/app/api/construction/marketing/companies/route";
import {
  companiesQuery,
  companyFormOptionsQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
import {
  NEEDS_REASSIGNING_API,
  needsReassigningQuery,
} from "@/src/queries/marketing-team";
import { getQueryClient } from "@/src/queries/query-client";
import {
  prefetchInfiniteRoute,
  prefetchRoute,
} from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../_components/marketing-no-access";
import { CompaniesList } from "./_components/companies-list";

export const metadata: Metadata = { title: "Prospect Companies" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [MARKETING_COMPANIES_API]: listCompanies,
  [`${MARKETING_COMPANIES_API}/form-options`]: formOptions,
  [NEEDS_REASSIGNING_API]: needsReassigning,
};

/** Prospect Companies, unfiltered on arrival (ADR-0052). */
export default async function Page() {
  const can = await viewerFlags("marketing.companies", [
    "read",
    "create",
    "transfer",
    "export",
  ]);
  if (!can.read) return <MarketingNoAccess what="Prospect Companies" />;

  const queryClient = getQueryClient();
  await Promise.all([
    prefetchInfiniteRoute(queryClient, companiesQuery(), ROUTES),
    prefetchRoute(queryClient, companyFormOptionsQuery, ROUTES),
    // The "need reassigning" notice; the list shows without it on a failure.
    can.transfer
      ? prefetchRoute(queryClient, needsReassigningQuery, ROUTES).catch(
          () => undefined,
        )
      : undefined,
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompaniesList
        canCreate={can.create}
        canTransfer={can.transfer}
        canExport={can.export}
      />
    </HydrationBoundary>
  );
}
