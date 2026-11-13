import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as formOptions } from "@/app/api/construction/marketing/visits/form-options/route";
import { GET as listVisits } from "@/app/api/construction/marketing/visits/route";
import {
  MARKETING_VISITS_API,
  visitCalendarQuery,
  visitFormOptionsQuery,
  visitsQuery,
} from "@/src/queries/marketing-visits";
import { getQueryClient } from "@/src/queries/query-client";
import {
  prefetchInfiniteRoute,
  prefetchRoute,
} from "@/src/queries/route-fetch";
import { todayIn } from "@/src/shared-kernel/calendar-date";

import { MarketingNoAccess } from "../_components/marketing-no-access";
import {
  calendarDays,
  chosenDay,
  type CalendarSpan,
} from "./_components/visit-calendar-dates";
import { VisitsList } from "./_components/visits-list";

export const metadata: Metadata = { title: "Visits" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [MARKETING_VISITS_API]: listVisits,
  [`${MARKETING_VISITS_API}/form-options`]: formOptions,
};

/**
 * Visits on arrival (ADR-0052): the list, or with `?view=calendar` the days
 * the calendar opens on; `?memberId=` (a row on the Team page) filters
 * them to one Marketing Person.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    calendar?: string;
    day?: string;
    memberId?: string | string[];
  }>;
}) {
  const can = await viewerFlags("marketing.visits", ["read", "create"]);
  if (!can.read) return <MarketingNoAccess what="Visits" />;
  const params = await searchParams;
  const memberId =
    typeof params.memberId === "string" && params.memberId !== ""
      ? params.memberId
      : undefined;

  const queryClient = getQueryClient();
  if (params.view === "calendar") {
    const options = await prefetchRoute(
      queryClient,
      visitFormOptionsQuery,
      ROUTES,
    );
    const span: CalendarSpan = params.calendar === "week" ? "week" : "month";
    const days = calendarDays(
      span,
      chosenDay(params.day, todayIn(options.timeZone)),
    );
    const [from = "", to = ""] = [days[0], days.at(-1)];
    await prefetchRoute(
      queryClient,
      visitCalendarQuery({ memberId }, from, to),
      ROUTES,
    );
  } else {
    await Promise.all([
      prefetchInfiniteRoute(queryClient, visitsQuery({ memberId }), ROUTES),
      prefetchRoute(queryClient, visitFormOptionsQuery, ROUTES),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VisitsList canCreate={can.create} memberId={memberId} />
    </HydrationBoundary>
  );
}
