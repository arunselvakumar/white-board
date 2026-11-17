import { describe, expect, it } from "vitest";

import { pageHref, uncheckedHref } from "./page-href";

describe("pageHref", () => {
  it("fills each dynamic segment from its param", () => {
    expect(
      pageHref("/app/projects/[id]/inspections/[inspectionId]", {
        id: "p1",
        inspectionId: "i9",
      }),
    ).toBe("/app/projects/p1/inspections/i9");
  });

  it("URL-encodes each param", () => {
    expect(pageHref("/app/projects/[id]", { id: "a b/c?" })).toBe(
      "/app/projects/a%20b%2Fc%3F",
    );
  });

  it("appends a query string or a fragment", () => {
    expect(
      pageHref("/app/projects/[id]/teams", { id: "p1" }, "?tab=labour"),
    ).toBe("/app/projects/p1/teams?tab=labour");
    expect(pageHref("/app/projects/[id]/teams", { id: "p1" }, "#vendors")).toBe(
      "/app/projects/p1/teams#vendors",
    );
  });
});

describe("uncheckedHref", () => {
  it("returns the path unchanged", () => {
    expect(uncheckedHref("/app/projects?status=active")).toBe(
      "/app/projects?status=active",
    );
  });
});
