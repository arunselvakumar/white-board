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
    ["/enquiries", ["Dashboard", "Enquiries"]],
    ["/enquiries/new", ["Dashboard", "Enquiries", "Add enquiry"]],
    ["/enquiries/sources", ["Dashboard", "Enquiries", "Enquiry Sources"]],
    ["/enquiries/summary", ["Dashboard", "Enquiries", "Enquiry summary"]],
    ["/enquiries/123", ["Dashboard", "Enquiries", "Enquiry"]],
    [
      "/enquiries/123/edit",
      ["Dashboard", "Enquiries", "Enquiry", "Edit enquiry"],
    ],
    [
      "/enquiries/123/convert",
      ["Dashboard", "Enquiries", "Enquiry", "Convert to Student"],
    ],
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

it("starts a Teacher's Enquiry trail at Enquiries", () => {
  expect(getAppBreadcrumbs("/enquiries", "org:teacher")).toEqual([
    { label: "Enquiries" },
  ]);
  expect(getAppBreadcrumbs("/enquiries/123/edit", "org:teacher")).toEqual([
    { label: "Enquiries", href: "/enquiries" },
    { label: "Enquiry", href: "/enquiries/123" },
    { label: "Edit enquiry" },
  ]);
});

it("trails Homework and Study Material for every role (ADR-0033)", () => {
  expect(getAppBreadcrumbs("/batches/b1/homework", "org:admin")).toEqual([
    { label: "Dashboard", href: "/" },
    { label: "Batches", href: "/batches" },
    { label: "Homework and Study Material", href: "/batches/b1/homework" },
  ]);
  expect(
    getAppBreadcrumbs("/batches/b1/homework/h1", "org:admin").map(
      (crumb) => crumb.label,
    ),
  ).toEqual([
    "Dashboard",
    "Batches",
    "Homework and Study Material",
    "Submissions",
  ]);
  expect(
    getAppBreadcrumbs("/teacher/batches/b1/homework/h1", "org:teacher"),
  ).toEqual([
    { label: "My Batches", href: "/teacher" },
    {
      label: "Homework and Study Material",
      href: "/teacher/batches/b1/homework",
    },
    { label: "Submissions" },
  ]);
  expect(
    getAppBreadcrumbs("/teacher/batches/b1/attendance", "org:teacher"),
  ).toEqual([
    { label: "My Batches", href: "/teacher" },
    { label: "Attendance" },
  ]);
  expect(getAppBreadcrumbs("/student/homework", "org:student")).toEqual([
    { label: "Homework", href: "/student/homework" },
  ]);
  expect(getAppBreadcrumbs("/parent/homework/h1", "org:parent")).toEqual([
    { label: "Homework", href: "/parent/homework" },
    { label: "Homework details" },
  ]);
});
