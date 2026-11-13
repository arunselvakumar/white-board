import { describe, expect, it } from "vitest";

import {
  customPeriodProblem,
  dashboardFilters,
  dashboardParams,
  loadMarketingDashboardSearch,
  marketingDashboardQuery,
} from "./marketing-dashboard";

const RAVI = "0199d000-0000-7000-8000-000000000002";

describe("the Marketing Dashboard's address", () => {
  it("opens on this month when the address says nothing", () => {
    expect(dashboardFilters(loadMarketingDashboardSearch(""))).toEqual({
      period: "this_month",
    });
  });

  it("reads a period and a person", () => {
    expect(
      dashboardFilters(
        loadMarketingDashboardSearch(
          `?period=last_month&memberId=${RAVI.toUpperCase()}`,
        ),
      ),
    ).toEqual({ period: "last_month", memberId: RAVI });
  });

  it("keeps a custom period's dates and drops them for a preset", () => {
    expect(
      dashboardFilters(
        loadMarketingDashboardSearch(
          "?period=custom&from=2026-11-03&to=2026-11-09",
        ),
      ),
    ).toEqual({ period: "custom", from: "2026-11-03", to: "2026-11-09" });
    expect(
      dashboardFilters(
        loadMarketingDashboardSearch(
          "?period=this_week&from=2026-11-03&to=2026-11-09",
        ),
      ),
    ).toEqual({ period: "this_week" });
  });

  it("opens this month for a custom period it cannot show, and ignores what it cannot read", () => {
    for (const search of [
      "?period=custom",
      "?period=custom&from=2026-11-09&to=2026-11-03",
      "?period=custom&from=2025-01-01&to=2026-11-03",
      "?period=custom&from=9-11-2026&to=2026-11-03",
      "?period=yesterday&memberId=ravi",
    ])
      expect(dashboardFilters(loadMarketingDashboardSearch(search))).toEqual({
        period: "this_month",
      });
  });
});

describe("customPeriodProblem", () => {
  it("allows up to a year, From on or before To", () => {
    expect(customPeriodProblem("2026-11-03", "2026-11-03")).toBeNull();
    expect(customPeriodProblem("2025-11-04", "2026-11-04")).toBeNull();
    expect(customPeriodProblem("2025-11-03", "2026-11-04")).toBe(
      "Choose at most a year.",
    );
    expect(customPeriodProblem("2026-11-04", "2026-11-03")).toBe(
      "Choose a From date on or before the To date.",
    );
    expect(customPeriodProblem("", "2026-11-03")).toBe("Choose both dates.");
  });
});

describe("marketingDashboardQuery", () => {
  it("asks the API for the period and person, keyed by each", () => {
    const filters = {
      period: "custom",
      from: "2026-11-03",
      to: "2026-11-09",
      memberId: RAVI,
    } as const;
    expect(dashboardParams(filters).toString()).toBe(
      `period=custom&from=2026-11-03&to=2026-11-09&memberId=${RAVI}`,
    );
    expect(marketingDashboardQuery(filters).queryKey).toEqual([
      "marketing",
      "dashboard",
      "custom",
      "2026-11-03",
      "2026-11-09",
      RAVI,
    ]);
    expect(dashboardParams({ period: "this_week" }).toString()).toBe(
      "period=this_week",
    );
  });
});
