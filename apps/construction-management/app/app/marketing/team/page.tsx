import { protectCompany } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { GET as getTeam } from "@/app/api/construction/marketing/team/route";
import { MARKETING_TEAM_API, teamQuery } from "@/src/queries/marketing-team";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import { MarketingNoAccess } from "../_components/marketing-no-access";
import { TeamPage } from "./_components/team-page";

export const metadata: Metadata = { title: "Marketing Team" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = { [MARKETING_TEAM_API]: getTeam };

/** Marketing People this month (ADR-0052). */
export default async function Page() {
  if (!(await viewerCan("marketing.team", "read")))
    return <MarketingNoAccess what="the Marketing Team" />;

  const auth = await protectCompany();
  const queryClient = getQueryClient();
  const [, timeZone] = await Promise.all([
    prefetchRoute(queryClient, teamQuery, ROUTES),
    // Last Visit dates are days in the Company time zone, on the server and
    // in the browser alike.
    auth.workspaceId == null
      ? "Asia/Kolkata"
      : companyTimezone(prisma, auth.workspaceId),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TeamPage timeZone={timeZone} />
    </HydrationBoundary>
  );
}
