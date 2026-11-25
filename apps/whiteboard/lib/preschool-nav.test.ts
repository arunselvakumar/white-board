import { describe, expect, it } from "vitest";

import {
  activePreschoolHref,
  preschoolBreadcrumbs,
  preschoolNavFor,
  preschoolPageByHref,
} from "./preschool-nav";
import { isAllowedPreschoolPath } from "./workspace-access";

const hrefs = (items: readonly { href: string }[]) =>
  items.map((item) => item.href);

describe("preschoolNavFor", () => {
  it("gives the Owner the Centre menu and the Head Office group", () => {
    const nav = preschoolNavFor({ role: "owner", hasSeveralCentres: true });
    expect(hrefs(nav.main)).toEqual([
      "/preschool",
      "/preschool/enquiries",
      "/preschool/children",
      "/preschool/attendance",
      "/preschool/daily-reports",
      "/preschool/fees",
      "/preschool/announcements",
      "/preschool/progress",
      "/preschool/stock",
      "/preschool/classrooms",
      "/preschool/staff",
    ]);
    expect(hrefs(nav.headOffice)).toEqual([
      "/preschool/head-office",
      "/preschool/head-office/royalty",
      "/preschool/centres",
      "/preschool/programmes",
      "/preschool/fees/structures",
      "/preschool/stock/items",
    ]);
  });

  it("leaves out Head Office and Royalty with one Centre", () => {
    const nav = preschoolNavFor({ role: "owner", hasSeveralCentres: false });
    expect(hrefs(nav.headOffice)).toEqual([
      "/preschool/centres",
      "/preschool/programmes",
      "/preschool/fees/structures",
      "/preschool/stock/items",
    ]);
  });

  it("gives a Centre Head no Head Office group", () => {
    const nav = preschoolNavFor({
      role: "centre_head",
      hasSeveralCentres: true,
    });
    expect(nav.main).toHaveLength(11);
    expect(nav.headOffice).toEqual([]);
  });

  it("gives Teachers and Parents their own menus", () => {
    expect(
      hrefs(preschoolNavFor({ role: "teacher", hasSeveralCentres: true }).main),
    ).toEqual([
      "/preschool/teacher",
      "/preschool/attendance",
      "/preschool/daily-reports",
      "/preschool/children",
      "/preschool/progress",
      "/preschool/announcements",
    ]);
    expect(
      hrefs(preschoolNavFor({ role: "parent", hasSeveralCentres: true }).main),
    ).toEqual(["/preschool/family", "/preschool/family/announcements"]);
  });

  it("links every role only to pages it may open", () => {
    for (const role of ["owner", "centre_head", "teacher", "parent"] as const) {
      const nav = preschoolNavFor({ role, hasSeveralCentres: true });
      for (const item of [...nav.main, ...nav.headOffice])
        expect(isAllowedPreschoolPath(item.href, role), item.href).toBe(true);
    }
  });
});

describe("activePreschoolHref", () => {
  it("picks the longest item that covers the path", () => {
    expect(activePreschoolHref("/preschool/fees")).toBe("/preschool/fees");
    expect(activePreschoolHref("/preschool/fees/structures/abc")).toBe(
      "/preschool/fees/structures",
    );
    expect(activePreschoolHref("/preschool/centres/new")).toBe(
      "/preschool/centres",
    );
  });

  it("keeps Homes to themselves", () => {
    expect(activePreschoolHref("/preschool")).toBe("/preschool");
    expect(activePreschoolHref("/preschool/unknown")).toBeNull();
    expect(activePreschoolHref("/preschool/family/announcements")).toBe(
      "/preschool/family/announcements",
    );
  });
});

describe("preschoolBreadcrumbs", () => {
  it("starts at the role's Home", () => {
    expect(preschoolBreadcrumbs("/preschool", "owner")).toEqual([
      { label: "Dashboard", href: "/preschool" },
    ]);
    expect(preschoolBreadcrumbs("/preschool/attendance", "teacher")).toEqual([
      { label: "Home", href: "/preschool/teacher" },
      { label: "Attendance", href: "/preschool/attendance" },
    ]);
  });

  it("names Add pages and records", () => {
    expect(preschoolBreadcrumbs("/preschool/centres/new", "owner")).toEqual([
      { label: "Dashboard", href: "/preschool" },
      { label: "Centres", href: "/preschool/centres" },
      { label: "Add Centre" },
    ]);
    expect(preschoolBreadcrumbs("/preschool/centres/abc", "owner")).toEqual([
      { label: "Dashboard", href: "/preschool" },
      { label: "Centres", href: "/preschool/centres" },
      { label: "Centre" },
    ]);
  });
});

describe("preschoolPageByHref", () => {
  it("finds a page's title", () => {
    expect(preschoolPageByHref("/preschool/head-office/royalty").title).toBe(
      "Royalty Statements",
    );
  });
});
