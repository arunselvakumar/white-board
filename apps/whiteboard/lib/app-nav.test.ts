import { describe, expect, it } from "vitest";

import { APP_NAV, appPageByHref, isAppNavActive, navForRole } from "./app-nav";

describe("role navigation", () => {
  it("shows each role its home, Calendar, and Online Classes", () => {
    expect(navForRole("org:student").map((item) => item.label)).toEqual([
      "Home",
      "Calendar",
      "Online Classes",
    ]);
    expect(navForRole("org:parent").map((item) => item.label)).toEqual([
      "Home",
      "Calendar",
      "Online Classes",
    ]);
    expect(navForRole("org:teacher").map((item) => item.label)).toEqual([
      "My Batches",
      "Enquiries",
      "Calendar",
      "Online Classes",
    ]);
    expect(navForRole("org:member")).toEqual([]);
    expect(navForRole("org:admin")).toEqual(APP_NAV);
  });
});

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
      "/calendar",
      "/online-classes",
      "/students",
      "/enquiries",
      "/courses",
      "/batches",
      "/teachers",
      "/attendance",
      "/fees",
    ]);
  });

  it("offers Calendar and Online Classes to every supported role", () => {
    for (const role of [
      "org:admin",
      "org:teacher",
      "org:student",
      "org:parent",
    ]) {
      expect(navForRole(role).some((item) => item.href === "/calendar")).toBe(
        true,
      );
      expect(
        navForRole(role).some((item) => item.href === "/online-classes"),
      ).toBe(true);
    }
  });
});
