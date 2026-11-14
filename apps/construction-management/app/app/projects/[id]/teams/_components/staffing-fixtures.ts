import type {
  ProjectLabour,
  ProjectLabourOption,
  ProjectLabourPage,
  ProjectSiteEngineer,
  ProjectSiteEngineerOption,
} from "@/src/queries/project-resources";

import { RESOURCES_API } from "./resource-fixtures";

/** Story data for the Site Engineers and Labours sections. */

export const LABOURS_API = `${RESOURCES_API}/labours`;
export const SITE_ENGINEERS_API = `${RESOURCES_API}/site-engineers`;

export const TODAY = "2026-11-11";

export const ANAND: ProjectSiteEngineer = {
  id: "0199a1b2-0000-7000-8000-000000000201",
  name: "Anand Kumar",
  mobile: "+919840012345",
  employeeCode: "SE-001",
  disabled: false,
};

export const BHASKAR: ProjectSiteEngineer = {
  id: "0199a1b2-0000-7000-8000-000000000202",
  name: "Bhaskar Raj",
  mobile: "+917708165767",
  employeeCode: null,
  disabled: true,
};

export const CHANDRAN: ProjectSiteEngineerOption = {
  id: "0199a1b2-0000-7000-8000-000000000203",
  name: "Chandran Pillai",
  mobile: "+919443012345",
  employeeCode: "SE-003",
  disabled: false,
  hasSignIn: true,
};

export const DURAI: ProjectSiteEngineerOption = {
  id: "0199a1b2-0000-7000-8000-000000000204",
  name: "Durai Murugan",
  mobile: null,
  employeeCode: "SE-004",
  disabled: false,
  hasSignIn: false,
};

const MASON = { id: "0199a1b2-0000-7000-8000-000000000301", name: "Mason" };
const HELPER = { id: "0199a1b2-0000-7000-8000-000000000302", name: "Helper" };

export const ARUMUGAM: ProjectLabour = {
  id: "0199a1b2-0000-7000-8000-000000000401",
  name: "Arumugam",
  labourCode: "L-001",
  labourCategory: MASON,
  since: "2026-03-02",
  isActive: true,
};

export const BALU: ProjectLabour = {
  id: "0199a1b2-0000-7000-8000-000000000402",
  name: "Balu",
  labourCode: null,
  labourCategory: HELPER,
  since: "2026-06-15",
  isActive: false,
};

export const CHINNA: ProjectLabour = {
  id: "0199a1b2-0000-7000-8000-000000000403",
  name: "Chinnasamy",
  labourCode: "L-014",
  labourCategory: null,
  since: "2026-10-01",
  isActive: true,
};

export const FEW_LABOURS: ProjectLabour[] = [ARUMUGAM, BALU, CHINNA];

export const DHANAM: ProjectLabourOption = {
  id: "0199a1b2-0000-7000-8000-000000000501",
  name: "Dhanalakshmi",
  labourCode: "L-020",
  labourCategory: HELPER,
  joiningDate: "2026-01-05",
};

export const ELANGO: ProjectLabourOption = {
  id: "0199a1b2-0000-7000-8000-000000000502",
  name: "Elango",
  labourCode: "L-021",
  labourCategory: MASON,
  joiningDate: "2026-02-10",
};

export const FATHIMA: ProjectLabourOption = {
  id: "0199a1b2-0000-7000-8000-000000000503",
  name: "Fathima",
  labourCode: null,
  labourCategory: null,
  joiningDate: "2026-09-20",
};

export const LABOUR_OPTIONS: ProjectLabourOption[] = [DHANAM, ELANGO, FATHIMA];

function pad(value: number): string {
  return String(value).padStart(3, "0");
}

/** `count` Labours named "Labour 001"…, as a Project with hundreds has. */
export function manyLabours(count: number): ProjectLabour[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `0199a1b2-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Labour ${pad(index + 1)}`,
    labourCode: `L-${pad(index + 1)}`,
    labourCategory: index % 3 === 0 ? HELPER : MASON,
    since: "2026-04-01",
    isActive: index % 17 !== 5,
  }));
}

/**
 * The list route over `all`: search, then pages of `limit` by position,
 * with cursors that are the index of the row they continue from.
 */
export function labourPage(
  all: readonly ProjectLabour[],
  search: URLSearchParams,
): ProjectLabourPage {
  const needle = (search.get("search") ?? "").toLowerCase();
  const matched = all.filter((item) =>
    `${item.name} ${item.labourCode ?? ""}`.toLowerCase().includes(needle),
  );
  const limit = Number(search.get("limit") ?? "50");
  const after = search.get("after");
  const before = search.get("before");
  const start =
    after != null
      ? Number(after) + 1
      : before != null
        ? Math.max(0, Number(before) - limit)
        : 0;
  const items = matched.slice(start, start + limit);
  const end = start + items.length;
  return {
    items,
    nextCursor: end < matched.length ? String(end - 1) : null,
    prevCursor: start > 0 ? String(start) : null,
    total: matched.length,
  };
}
