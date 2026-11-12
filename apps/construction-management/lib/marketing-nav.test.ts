import { describe, expect, it } from "vitest";

import {
  FULL_MARKETING_ACCESS,
  MARKETING_PATH,
  MARKETING_TEAM_PATH,
  MARKETING_VISITS_PATH,
  NO_MARKETING_ACCESS,
  activeMarketingSection,
  marketingSections,
} from "./marketing-nav";

/** The Marketing Role's entries (ADR CM-0040 §3). */
const MARKETING_ROLE = {
  ...NO_MARKETING_ACCESS,
  dashboard: true,
  visits: true,
  followUps: true,
  companies: true,
};

describe("Marketing entries (ADR CM-0040 §1)", () => {
  it("lists all six in menu order for a Role with every Marketing menu", () => {
    expect(
      marketingSections(FULL_MARKETING_ACCESS).map((section) => section.label),
    ).toEqual([
      "Dashboard",
      "Visits",
      "Follow-ups",
      "Companies",
      "Team",
      "Reports",
    ]);
  });

  it("leaves out what the Role does not open", () => {
    expect(
      marketingSections(MARKETING_ROLE).map((section) => section.label),
    ).toEqual(["Dashboard", "Visits", "Follow-ups", "Companies"]);
  });

  it("matches a page to its entry, and only the area's own address to the Dashboard", () => {
    expect(activeMarketingSection(MARKETING_PATH)?.label).toBe("Dashboard");
    expect(activeMarketingSection(`${MARKETING_VISITS_PATH}/v1`)?.label).toBe(
      "Visits",
    );
    expect(activeMarketingSection(MARKETING_TEAM_PATH)?.label).toBe("Team");
    expect(activeMarketingSection("/app/marketingx")).toBeUndefined();
    expect(activeMarketingSection("/app/projects")).toBeUndefined();
  });
});
