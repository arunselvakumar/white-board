import { describe, expect, it } from "vitest";

import { PROJECT_MODULE_KEYS } from "@/src/projects/domain/project-modules";
import { PROJECT_NAV_GROUPS } from "@/src/projects/domain/project-nav-groups";

import {
  activeProjectSegment,
  firstProjectModulePath,
  projectIdFromPath,
  projectNavGroups,
} from "./project-nav";

const ID = "0199c4a0-0000-7000-8000-000000000001";

function labels(groups: ReturnType<typeof projectNavGroups>) {
  return groups.map((group) => [
    group.label,
    group.sections.map((section) => section.label),
  ]);
}

describe("PROJECT_NAV_GROUPS", () => {
  it("puts every module under exactly one heading", () => {
    const keys = PROJECT_NAV_GROUPS.flatMap((group) => group.keys);
    expect([...keys].sort()).toEqual([...PROJECT_MODULE_KEYS].sort());
  });
});

describe("projectNavGroups", () => {
  it("falls back to every module of the structure until the home loads", () => {
    expect(labels(projectNavGroups(undefined, "wings"))).toEqual([
      ["Overview", ["Dashboard"]],
      ["Setup", ["Wings", "Amenities", "Resources"]],
      [
        "Site work",
        [
          "Attendance",
          "Daily Worksheet",
          "Tasks",
          "Site Diary",
          "Hindrances",
          "Equipment",
        ],
      ],
      ["Materials & money", ["Materials", "Payments"]],
      ["Quality", ["Issues & Snags", "Inspections", "Testing Reports"]],
      // M11 (ADR CM-0023 §22).
      [
        "Contracts",
        [
          "BOQ",
          "Work Orders",
          "Measurements",
          "Contractor Bills",
          "Client Bills",
        ],
      ],
      ["Sales", ["Inquiries", "Bookings"]],
      ["Files", ["Drawings", "Documents", "Gallery"]],
      ["Reports", ["Progress Reports", "Reports"]],
    ]);
    const locations = projectNavGroups(undefined, "locations");
    expect(labels(locations)[1]).toEqual([
      "Setup",
      ["Locations", "Amenities", "Resources"],
    ]);
    // A Project without Wings has nothing to book (CM-0022 §1).
    expect(labels(locations)).toContainEqual(["Sales", ["Inquiries"]]);
  });

  it("shows the member's modules under fixed headings, not in tile order", () => {
    const home = {
      modules: [
        { key: "payments", hidden: false },
        { key: "documents", hidden: false },
        { key: "attendance", hidden: false },
        { key: "gallery", hidden: true },
      ],
    };
    expect(labels(projectNavGroups(home, "wings"))).toEqual([
      ["Site work", ["Attendance"]],
      ["Materials & money", ["Payments"]],
      ["Files", ["Documents"]],
    ]);
  });
});

describe("firstProjectModulePath", () => {
  const base = `/app/projects/${ID}`;

  it("is Dashboard when the member may open it", () => {
    const groups = projectNavGroups(
      { modules: [{ key: "dashboard", hidden: false }] },
      "wings",
    );
    expect(firstProjectModulePath(ID, groups)).toBe(`${base}/dashboard`);
  });

  it("is the first module in the menu when Dashboard is hidden or not allowed", () => {
    const hidden = projectNavGroups(
      {
        modules: [
          { key: "reports", hidden: false },
          { key: "dashboard", hidden: true },
          { key: "attendance", hidden: false },
        ],
      },
      "wings",
    );
    expect(firstProjectModulePath(ID, hidden)).toBe(`${base}/attendance`);
  });

  it("is null when the member can open no module", () => {
    expect(
      firstProjectModulePath(ID, projectNavGroups({ modules: [] }, "wings")),
    ).toBeNull();
    const allHidden = projectNavGroups(
      { modules: [{ key: "dashboard", hidden: true }] },
      "wings",
    );
    expect(firstProjectModulePath(ID, allHidden)).toBeNull();
  });
});

describe("projectIdFromPath", () => {
  it("reads the Project from any page under it", () => {
    expect(projectIdFromPath(`/app/projects/${ID}`)).toBe(ID);
    expect(projectIdFromPath(`/app/projects/${ID}/payments/wages`)).toBe(ID);
  });

  it("is null on the Projects home, New Project and other areas", () => {
    expect(projectIdFromPath("/app/projects")).toBeNull();
    expect(projectIdFromPath("/app/projects/new")).toBeNull();
    expect(projectIdFromPath("/app/masters/suppliers")).toBeNull();
  });

  it("is null, not a crash, for a malformed escape", () => {
    expect(projectIdFromPath("/app/projects/%E0")).toBeNull();
    expect(projectIdFromPath("/app/projects/%E0/payments")).toBeNull();
  });
});

describe("activeProjectSegment", () => {
  const segments = ["dashboard", "payments", "tasks"];

  it("is the module the page is under", () => {
    expect(
      activeProjectSegment(`/app/projects/${ID}/payments/wages`, ID, segments),
    ).toBe("payments");
  });

  it("is none on Edit, the bare Project path and pages outside the menu", () => {
    expect(
      activeProjectSegment(`/app/projects/${ID}/edit`, ID, segments),
    ).toBeNull();
    expect(
      activeProjectSegment(`/app/projects/${ID}`, ID, segments),
    ).toBeNull();
    expect(
      activeProjectSegment(`/app/projects/${ID}/gallery`, ID, segments),
    ).toBeNull();
  });
});
