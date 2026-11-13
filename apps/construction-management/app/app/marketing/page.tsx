import { protectCompany } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { mainMenuAccess } from "@/app/app/_lib/main-menu-access";
import { GET as getDashboard } from "@/app/api/construction/marketing/dashboard/route";
import { marketingSections } from "@/lib/marketing-nav";
import { QueryHttpError } from "@/src/queries/http";
import {
  dashboardFilters,
  loadMarketingDashboardSearch,
  MARKETING_DASHBOARD_API,
  marketingDashboardQuery,
  type MarketingDashboardFilters,
} from "@/src/queries/marketing-dashboard";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import { MarketingDashboard } from "./_components/marketing-dashboard";
import { MarketingNoAccess } from "./_components/marketing-no-access";

export const metadata: Metadata = { title: "Marketing Dashboard" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = { [MARKETING_DASHBOARD_API]: getDashboard };

/** A person in the address the viewer may not pick, or who is not one. */
const PERSON_REFUSED = new Set([
  "DASHBOARD_PERSON_NOT_ALLOWED",
  "MARKETING_PERSON_NOT_FOUND",
]);

/**
 * Marketing opens on its Dashboard, or on the first entry the Role opens
 * when the Dashboard is not one of them (ADR CM-0040 §1). The figures for
 * the period the address asks for, this month by default, are prefetched
 * (ADR-0052); a person the viewer cannot pick falls back to everyone's.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { marketing } = await mainMenuAccess();
  if (!marketing.dashboard) {
    const first = marketingSections(marketing)[0];
    if (first == null) return <MarketingNoAccess what="Marketing" />;
    redirect(first.href);
  }

  const filters = dashboardFilters(
    await loadMarketingDashboardSearch(searchParams),
  );
  const auth = await protectCompany();
  const queryClient = getQueryClient();
  const prefetch = (asked: MarketingDashboardFilters) =>
    prefetchRoute(queryClient, marketingDashboardQuery(asked), ROUTES);
  const [ignorePerson, timeZone] = await Promise.all([
    prefetch(filters).then(
      () => false,
      async (error: unknown) => {
        if (
          filters.memberId == null ||
          !(error instanceof QueryHttpError) ||
          !PERSON_REFUSED.has(error.code)
        )
          throw error;
        await prefetch({ ...filters, memberId: undefined });
        return true;
      },
    ),
    // Times of day are the Company's, on the server and in the browser alike.
    auth.workspaceId == null
      ? "Asia/Kolkata"
      : companyTimezone(prisma, auth.workspaceId),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MarketingDashboard timeZone={timeZone} ignorePerson={ignorePerson} />
    </HydrationBoundary>
  );
}
