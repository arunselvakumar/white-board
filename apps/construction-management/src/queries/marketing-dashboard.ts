import { queryOptions } from "@tanstack/react-query";
import { createLoader, createParser, parseAsStringLiteral } from "nuqs/server";

import type { GetConstructionMarketingDashboardResponse } from "@/app/api/construction/marketing/dashboard/dashboard-models";
import {
  DASHBOARD_MAX_DAYS,
  DASHBOARD_PERIODS,
  type DashboardPeriodKind,
} from "@/src/marketing/domain/dashboard";
import { daysBetween } from "@/src/shared-kernel/calendar-date";

import { apiJson } from "./http";

export type MarketingDashboard = GetConstructionMarketingDashboardResponse;

export const MARKETING_DASHBOARD_API = "/api/construction/marketing/dashboard";

/** What the Dashboard is asked for: a period and, with View all, one person. */
export type MarketingDashboardFilters = {
  period: DashboardPeriodKind;
  /** `YYYY-MM-DD`, only with a custom period. */
  from?: string;
  to?: string;
  memberId?: string;
};

const parseAsCalendarDate = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value,
});

const parseAsUuid = createParser({
  parse: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value.toLowerCase()
      : null,
  serialize: (value: string) => value,
});

/**
 * `?period=&from=&to=&memberId=`, read the same way by the page on the
 * server (its prefetch) and by the screen in the browser.
 */
export const MARKETING_DASHBOARD_SEARCH = {
  period: parseAsStringLiteral(DASHBOARD_PERIODS).withDefault("this_month"),
  from: parseAsCalendarDate,
  to: parseAsCalendarDate,
  memberId: parseAsUuid,
};

export const loadMarketingDashboardSearch = createLoader(
  MARKETING_DASHBOARD_SEARCH,
);

/** Why a custom period cannot be shown, or null when it can. */
export function customPeriodProblem(from: string, to: string): string | null {
  if (from === "" || to === "") return "Choose both dates.";
  if (from > to) return "Choose a From date on or before the To date.";
  if (daysBetween(from, to) + 1 > DASHBOARD_MAX_DAYS)
    return "Choose at most a year.";
  return null;
}

/**
 * The filters an address asks for. A custom period without two usable
 * dates opens this month instead of an error.
 */
export function dashboardFilters(search: {
  period: DashboardPeriodKind;
  from: string | null;
  to: string | null;
  memberId: string | null;
}): MarketingDashboardFilters {
  const memberId = search.memberId ?? undefined;
  const person = memberId == null ? {} : { memberId };
  if (search.period !== "custom") return { period: search.period, ...person };
  const { from, to } = search;
  if (from == null || to == null || customPeriodProblem(from, to) != null)
    return { period: "this_month", ...person };
  return { period: "custom", from, to, ...person };
}

export function dashboardParams(
  filters: MarketingDashboardFilters,
): URLSearchParams {
  const params = new URLSearchParams({ period: filters.period });
  if (filters.period === "custom") {
    params.set("from", filters.from ?? "");
    params.set("to", filters.to ?? "");
  }
  if (filters.memberId != null) params.set("memberId", filters.memberId);
  return params;
}

/** Every Dashboard read; Visit, Follow-up and company writes may refresh it. */
export const MARKETING_DASHBOARD_KEY = ["marketing", "dashboard"] as const;

/** The Marketing Dashboard for a period, and one person's with View all. */
export function marketingDashboardQuery(filters: MarketingDashboardFilters) {
  const params = dashboardParams(filters);
  return queryOptions({
    queryKey: [
      ...MARKETING_DASHBOARD_KEY,
      filters.period,
      filters.from ?? null,
      filters.to ?? null,
      filters.memberId ?? null,
    ],
    queryFn: ({ meta }) =>
      apiJson<MarketingDashboard>(
        `${MARKETING_DASHBOARD_API}?${params.toString()}`,
        undefined,
        meta,
      ),
  });
}
