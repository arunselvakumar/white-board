import { describe, expect, it } from "vitest";

import { APP_NAV, appPageByHref, isAppNavActive } from "./app-nav";

describe("isAppNavActive", () => {
  it("treats Dashboard as active only on the In-app Home", () => {
    expect(isAppNavActive("/", "/")).toBe(true);
    expect(isAppNavActive("/students", "/")).toBe(false);
    expect(isAppNavActive("/students/abc", "/")).toBe(false);
  });

  it("treats nested resource paths as active for that nav item", () => {
    expect(isAppNavActive("/students", "/students")).toBe(true);
    expect(isAppNavActive("/students/abc", "/students")).toBe(true);
    expect(isAppNavActive("/courses", "/students")).toBe(false);
  });
});

describe("appPageByHref", () => {
  it("returns Owner Dashboard copy for the In-app Home", () => {
    expect(appPageByHref("/").title).toBe("Owner Dashboard");
    expect(appPageByHref("/").label).toBe("Dashboard");
  });

  it("covers every nav item", () => {
    expect(APP_NAV.map((item) => item.href)).toEqual([
      "/",
      "/students",
      "/courses",
      "/batches",
      "/fees",
    ]);
  });
});
