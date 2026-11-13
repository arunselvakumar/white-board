import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan, viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as getCompany } from "@/app/api/construction/marketing/companies/[id]/route";
import { GET as formOptions } from "@/app/api/construction/marketing/visits/form-options/route";
import {
  companyQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
import {
  MARKETING_VISITS_API,
  visitFormOptionsQuery,
} from "@/src/queries/marketing-visits";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../_components/marketing-no-access";
import { VisitNew } from "../_components/visit-form-pages";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<Metadata> {
  const { status } = await searchParams;
  return { title: status === "completed" ? "Log Visit" : "Plan Visit" };
}

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [`${MARKETING_VISITS_API}/form-options`]: formOptions,
  [`${MARKETING_COMPANIES_API}/[id]`]: routeHandler(getCompany),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The well-formed ids of a comma-separated list. */
function ids(raw: string | undefined): string[] {
  return (raw ?? "").split(",").filter((id) => UUID.test(id));
}

/**
 * `?status=planned` plans a Visit, `?status=completed` logs one already
 * made; `&prospectCompanyId=` picks the company, and `&contactIds=` and
 * `&visitorIds=` (Log the visit from a Follow-up) its people.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    prospectCompanyId?: string;
    contactIds?: string;
    visitorIds?: string;
  }>;
}) {
  const params = await searchParams;
  const status = params.status === "completed" ? "completed" : "planned";
  const prospectCompanyId =
    params.prospectCompanyId != null && UUID.test(params.prospectCompanyId)
      ? params.prospectCompanyId
      : undefined;
  // A write needs Visits read too: the routes answer 403 without it.
  const flags = await viewerFlags("marketing.visits", ["read", "create"]);
  if (!flags.read || !flags.create)
    return <MarketingNoAccess what="adding Visits" />;
  const canAddFollowUp = await viewerCan("marketing.follow_ups", "create");

  const queryClient = getQueryClient();
  await Promise.all([
    prefetchRoute(queryClient, visitFormOptionsQuery, ROUTES),
    // Its Contacts for the points of contact; the form reads them itself
    // when this fails (no Companies read, or not one of the viewer's).
    prospectCompanyId == null
      ? undefined
      : prefetchRoute(
          queryClient,
          companyQuery(prospectCompanyId),
          ROUTES,
        ).catch(() => undefined),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VisitNew
        status={status}
        prospectCompanyId={prospectCompanyId}
        contactIds={prospectCompanyId == null ? [] : ids(params.contactIds)}
        visitorIds={ids(params.visitorIds)}
        canAddFollowUp={canAddFollowUp}
      />
    </HydrationBoundary>
  );
}
