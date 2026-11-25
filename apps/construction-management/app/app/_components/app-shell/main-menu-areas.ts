import { APP_NAV, type AppNavItem } from "@/lib/app-nav";
import { visibleDepartments } from "@/lib/departments-nav";
import type { MarketingMenuAccess } from "@/lib/marketing-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";
import { APP_HOME } from "@/lib/safe-redirect";

import type { AreaNavGroup } from "./area-nav-menu";
import { departmentsMenuGroups, filterDepartments } from "./departments-menu";
import { filterMenuArea, labelMatches, type AreaMatch } from "./menu-filter";
import { WORKSPACE_GROUPS } from "./workspace-nav-menu";
import type { AppHref } from "@/lib/page-href";

/** Home (ADR CM-0039): the main menu on one page. */
export const HOME_PATH = "/app";
export const HOME_LABEL = "Main menu";

/**
 * Where Home sends a User in the sidebar layout, which has the menu beside
 * every page already: the Dashboard, or Projects without Dashboard Read.
 */
export function sidebarHomePath(canOpenDashboard: boolean): AppHref {
  return canOpenDashboard ? "/app/dashboard" : APP_HOME;
}

/** What the viewer's Role lets the main menu show. */
export type MainMenuAccess = {
  /** Dashboard Read: without it the Dashboard is not in the menu. */
  canOpenDashboard: boolean;
  /** Team Members or Role Management Read (ADR CM-0030, ADR CM-0034). */
  canOpenStaffRoles: boolean;
  /** Departments Read: Manage Departments under Departments (ADR CM-0049). */
  canManageDepartments: boolean;
  /**
   * The Marketing entries the Role opens; none leaves Marketing out of
   * Departments (ADR CM-0040, ADR CM-0046).
   */
  marketing: MarketingMenuAccess;
};

export type MainMenuArea = {
  item: AppNavItem;
  /** Where the area's own link goes. */
  href: AppHref;
  /** The submenu; undefined for an area that is one page. */
  groups?: readonly AreaNavGroup[];
  /**
   * The area's own search rule, when the shared one (`menu-filter.ts`)
   * does not fit: Departments also finds the screens on its departments'
   * pages, which its submenu does not list.
   */
  filter?: (query: string) => AreaMatch<AreaNavGroup> | null;
};

/**
 * The main menu the viewer may see, in order: the one list behind the
 * sidebar's main menu and Home (ADR CM-0039).
 */
export function mainMenuAreas({
  canOpenDashboard,
  canOpenStaffRoles,
  canManageDepartments,
  marketing,
}: MainMenuAccess): MainMenuArea[] {
  return APP_NAV.flatMap((item): MainMenuArea[] => {
    switch (item.href) {
      case "/app/dashboard":
        return canOpenDashboard ? [{ item, href: item.href }] : [];
      case "/app/departments": {
        const departments = visibleDepartments({
          canOpenStaffRoles,
          marketing,
        });
        return [
          {
            item,
            href: item.href,
            groups: departmentsMenuGroups(departments, canManageDepartments),
            filter: (query) =>
              filterDepartments(departments, query, canManageDepartments),
          },
        ];
      }
      case "/app/workspace":
        return [{ item, href: item.href, groups: WORKSPACE_GROUPS }];
      case "/app/masters":
        return [{ item, href: item.href, groups: MASTERS_GROUPS }];
      default:
        return [{ item, href: item.href }];
    }
  });
}

export type MainMenuRow = {
  area: MainMenuArea;
  /** An area's groups under the menu search; null for a one-page area. */
  match: AreaMatch<AreaNavGroup> | null;
};

/** The areas left under the (normalised) menu search (`menu-filter.ts`). */
export function filterMainMenu(
  areas: readonly MainMenuArea[],
  query: string,
): MainMenuRow[] {
  return areas.flatMap((area): MainMenuRow[] => {
    if (area.filter != null) {
      const match = area.filter(query);
      return match == null ? [] : [{ area, match }];
    }
    if (area.groups == null)
      return labelMatches(area.item.label, query)
        ? [{ area, match: null }]
        : [];
    const match = filterMenuArea(area.item.label, area.groups, query);
    return match == null ? [] : [{ area, match }];
  });
}
