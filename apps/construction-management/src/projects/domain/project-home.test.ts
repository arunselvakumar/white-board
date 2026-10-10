import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  cleanDashboardLayout,
  defaultDashboardLayout,
  storedDashboardLayout,
} from "./dashboard-sections";
import {
  arrangeModules,
  cleanModuleKeys,
  homeModules,
  pinnedFirst,
} from "./project-home";
import { PROJECT_MODULE_KEYS } from "./project-modules";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
  return undefined;
}

const everything = {
  structure: "wings" as const,
  rows: { wings: false, locations: false },
  canRead: () => true,
  hidden: new Set<string>(),
  showHidden: false,
  tileOrder: [] as string[],
};

describe("homeModules", () => {
  it("shows every module the member may read, in the default order, one structure", () => {
    const keys = homeModules(everything).map((module) => module.key);
    expect(keys).toEqual(
      PROJECT_MODULE_KEYS.filter((key) => key !== "locations"),
    );
    expect(
      homeModules({ ...everything, structure: "locations" }).map(
        (module) => module.key,
      ),
    ).not.toContain("wings");
  });

  it("shows the other structure once the Project has rows of it", () => {
    const keys = homeModules({
      ...everything,
      rows: { wings: false, locations: true },
    }).map((module) => module.key);
    expect(keys).toContain("wings");
    expect(keys).toContain("locations");
  });

  it("leaves out modules without Read on their menu", () => {
    const keys = homeModules({
      ...everything,
      canRead: (menu) => menu === "projects.project",
    }).map((module) => module.key);
    expect(keys).toEqual(["amenities", "documents", "resources"]);
  });

  it("drops hidden modules, or marks them for those who may unhide them", () => {
    const hidden = new Set(["gallery", "reports"]);
    const shown = homeModules({ ...everything, hidden });
    expect(shown.map((module) => module.key)).not.toContain("gallery");
    const marked = homeModules({ ...everything, hidden, showHidden: true });
    expect(
      marked.filter((module) => module.hidden).map((module) => module.key),
    ).toEqual(["gallery", "reports"]);
  });

  it("follows the member's tile order, then the default order", () => {
    const keys = homeModules({
      ...everything,
      tileOrder: ["reports", "gone", "drawings", "reports"],
    }).map((module) => module.key);
    expect(keys.slice(0, 3)).toEqual(["reports", "drawings", "dashboard"]);
    expect(arrangeModules([]).map((module) => module.key)).toEqual(
      PROJECT_MODULE_KEYS,
    );
  });
});

describe("cleanModuleKeys", () => {
  it("accepts module keys once and refuses others", () => {
    expect(cleanModuleKeys(["gallery", "reports", "gallery"])).toEqual([
      "gallery",
      "reports",
    ]);
    expect(codeOf(() => cleanModuleKeys(["gallery", "chat"]))).toBe(
      "PROJECT_MODULE_UNKNOWN",
    );
  });
});

describe("pinnedFirst", () => {
  it("moves pinned items up and keeps both groups' order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(
      pinnedFirst(items, new Set(["d", "b"])).map((item) => item.id),
    ).toEqual(["b", "d", "a", "c"]);
  });
});

describe("dashboard layout", () => {
  it("defaults to every section shown", () => {
    expect(storedDashboardLayout(null)).toEqual(defaultDashboardLayout());
    expect(defaultDashboardLayout().every((section) => section.visible)).toBe(
      true,
    );
  });

  it("reads a stored layout and appends sections it does not name", () => {
    const layout = storedDashboardLayout([
      { key: "attendance", visible: false },
      { key: "retired", visible: true },
      { key: "attendance", visible: true },
      "junk",
      { key: "summary" },
    ]);
    expect(layout.slice(0, 3)).toEqual([
      { key: "attendance", visible: false },
      { key: "summary", visible: true },
      { key: "task", visible: true },
    ]);
    expect(layout).toHaveLength(defaultDashboardLayout().length);
  });

  it("refuses unknown and repeated sections", () => {
    expect(
      codeOf(() => cleanDashboardLayout([{ key: "chat", visible: true }])),
    ).toBe("DASHBOARD_SECTION_UNKNOWN");
    expect(
      codeOf(() =>
        cleanDashboardLayout([
          { key: "task", visible: true },
          { key: "task", visible: false },
        ]),
      ),
    ).toBe("DASHBOARD_SECTION_DUPLICATE");
    expect(
      cleanDashboardLayout([{ key: "payments", visible: false }])[0],
    ).toEqual({ key: "payments", visible: false });
  });
});
