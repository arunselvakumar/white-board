import { describe, expect, it } from "vitest";

import { getAppBreadcrumbs } from "./app-breadcrumbs";

it("shows Home instead of Dashboard in family navigation", () => {
  expect(getAppBreadcrumbs("/", "org:student")).toEqual([
    { label: "Home", href: "/student" },
  ]);
  expect(getAppBreadcrumbs("/parent", "org:parent")).toEqual([
    { label: "Home", href: "/parent" },
  ]);
});

describe("getAppBreadcrumbs", () => {
  it("shows Online Classes as its current page for each supported role", () => {
    for (const role of [
      "org:admin",
      "org:teacher",
      "org:student",
      "org:parent",
    ]) {
      expect(getAppBreadcrumbs("/online-classes", role)).toEqual([
        { label: "Online Classes", href: "/online-classes" },
      ]);
    }
  });

  it("marks Dashboard as the current page on the app home", () => {
    expect(getAppBreadcrumbs("/")).toEqual([{ label: "Dashboard", href: "/" }]);
  });

  it.each([
    ["/students", ["Dashboard", "Students"]],
    ["/courses/new", ["Dashboard", "Courses", "Add Course"]],
    ["/batches/123", ["Dashboard", "Batches", "Edit Batch"]],
    ["/courses/123", ["Dashboard", "Courses", "Edit Course"]],
    [
      "/students/123/edit",
      ["Dashboard", "Students", "Student", "Edit Student"],
    ],
    [
      "/students/123/enroll",
      ["Dashboard", "Students", "Student", "Enroll Student"],
    ],
    [
      "/batches/123/enroll",
      ["Dashboard", "Batches", "Batch", "Enroll Student"],
    ],
    ["/enrollments/123", ["Dashboard", "Enrollment"]],
    ["/payments/123/receipt", ["Dashboard", "Fees", "Receipt"]],
  ])("builds a trail for %s", (pathname, labels) => {
    const crumbs = getAppBreadcrumbs(pathname);
    expect(crumbs.map((crumb) => crumb.label)).toEqual(labels);
    expect(crumbs.at(-1)?.href).toBeUndefined();
    expect(crumbs.slice(0, -1).every((crumb) => crumb.href != null)).toBe(true);
  });

  it("links back to the resource from its nested page", () => {
    expect(getAppBreadcrumbs("/students/123/edit")[2]).toEqual({
      label: "Student",
      href: "/students/123",
    });
  });
});
