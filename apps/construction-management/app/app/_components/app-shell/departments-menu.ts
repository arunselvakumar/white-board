import type { DepartmentCard, VisibleDepartment } from "@/lib/departments-nav";

import type { AreaNavGroup } from "./area-nav-menu";
import { labelMatches, type AreaMatch } from "./menu-filter";

export const DEPARTMENTS_LABEL = "Departments";

function row({ href, label, icon }: DepartmentCard) {
  return { href, label, icon };
}

/**
 * Departments' submenu (ADR CM-0046): one row per department the viewer
 * may open. A department's screens are cards on its page, not rows here.
 */
export function departmentsMenuGroups(
  departments: readonly VisibleDepartment[],
): readonly AreaNavGroup[] {
  return [{ sections: departments.map(({ department }) => row(department)) }];
}

/**
 * Departments under the (normalised) menu search. The submenu lists only
 * the departments, so the shared rule (`menu-filter.ts`) would lose the
 * screens on their pages; this one finds them too:
 *
 * 1. An empty query shows the departments, nothing forced open.
 * 2. "Departments" itself matching shows the departments, held open.
 * 3. A department whose name matches shows as its own row.
 * 4. Otherwise its screens whose name, or whose group's name ("Staff",
 *    "HRMS"), matches show under the department's name ("pay" finds
 *    nothing; "lab" finds Human Resources → Labour).
 * 5. Nothing matching leaves Departments out of the menu.
 */
export function filterDepartments(
  departments: readonly VisibleDepartment[],
  query: string,
): AreaMatch<AreaNavGroup> | null {
  const all = departmentsMenuGroups(departments);
  if (query === "") return { groups: [...all], all: true, forceOpen: false };
  if (labelMatches(DEPARTMENTS_LABEL, query))
    return { groups: [...all], all: true, forceOpen: true };

  const named: ReturnType<typeof row>[] = [];
  const screens: AreaNavGroup[] = [];
  for (const { department, groups } of departments) {
    if (labelMatches(department.label, query)) {
      named.push(row(department));
      continue;
    }
    const sections = groups.flatMap((group) =>
      group.label != null && labelMatches(group.label, query)
        ? group.sections
        : group.sections.filter((section) =>
            labelMatches(section.label, query),
          ),
    );
    if (sections.length > 0)
      screens.push({ label: department.label, sections: sections.map(row) });
  }

  const shown = [
    ...(named.length > 0 ? [{ sections: named }] : []),
    ...screens,
  ];
  return shown.length === 0
    ? null
    : { groups: shown, all: false, forceOpen: true };
}
