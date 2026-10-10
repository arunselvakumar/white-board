import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HRMS_PAGES,
  HRMS_PATH,
  HRMS_SECTIONS,
  activeHrmsPage,
  activeHrmsSection,
  hrmsPage,
} from "./hrms-nav";

/** The App Router folder: a route `/app/x` lives in `app/app/x/page.tsx`. */
const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app",
);

describe("HRMS_SECTIONS", () => {
  it("has the five sections of modules/10, in order", () => {
    expect(HRMS_SECTIONS.map((section) => section.label)).toEqual([
      "Dashboard",
      "Attendance",
      "Leave",
      "Salary",
      "Configuration",
    ]);
    expect(HRMS_PAGES).toHaveLength(1 + 4 + 3 + 2 + 9);
  });

  it("lists every page once, under its section, with a page.tsx", () => {
    const hrefs = HRMS_PAGES.map((page) => page.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const section of HRMS_SECTIONS) {
      expect(section.href.startsWith(HRMS_PATH)).toBe(true);
      expect(existsSync(path.join(APP_DIR, section.href, "page.tsx"))).toBe(
        true,
      );
      for (const page of section.pages) {
        expect(
          page.href === section.href ||
            page.href.startsWith(`${section.href}/`),
        ).toBe(true);
        expect(existsSync(path.join(APP_DIR, page.href, "page.tsx"))).toBe(
          true,
        );
      }
    }
  });

  it("finds the section and page a path belongs to", () => {
    expect(activeHrmsSection(HRMS_PATH)?.key).toBe("dashboard");
    expect(activeHrmsPage(HRMS_PATH)?.title).toBe("HRMS Dashboard");
    expect(activeHrmsSection(`${HRMS_PATH}/attendance`)?.key).toBe(
      "attendance",
    );
    expect(activeHrmsPage(`${HRMS_PATH}/attendance/team`)?.title).toBe(
      "Team Attendance",
    );
    expect(
      activeHrmsPage(`${HRMS_PATH}/configuration/holidays/import`)?.label,
    ).toBe("Holidays");
    expect(activeHrmsSection(`${HRMS_PATH}/leavex`)).toBeUndefined();
    expect(activeHrmsSection("/app/workspace")).toBeUndefined();
    expect(activeHrmsPage(`${HRMS_PATH}/salary`)).toBeUndefined();
  });

  it("looks a page up by href", () => {
    expect(hrmsPage(`${HRMS_PATH}/configuration/settings`).ticket).toBe(
      "CM-303",
    );
    expect(() => hrmsPage("/app/nowhere")).toThrow();
  });
});
