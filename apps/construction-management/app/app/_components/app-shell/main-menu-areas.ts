import { APP_NAV, type AppNavItem } from "@/lib/app-nav";
import { HRMS_PATH } from "@/lib/hrms-nav";
import {
  marketingSections,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";
import { APP_HOME } from "@/lib/safe-redirect";
import { LABOURS_PAGE_PATH } from "@/lib/staff-nav";

import type { AreaNavGroup } from "./area-nav-menu";
import { humanResourcesGroups } from "./human-resources-nav-menu";
import { marketingGroups } from "./marketing-nav-menu";
import { filterMenuArea, labelMatches, type AreaMatch } from "./menu-filter";
import { WORKSPACE_GROUPS } from "./workspace-nav-menu";

/** Home (ADR CM-0039): the main menu on one page. */
export const HOME_PATH = "/app";
export const HOME_LABEL = "Main menu";

/**
 * Where Home sends a User in the sidebar layout, which has the menu beside
 * every page already: the Dashboard, or Projects without Dashboard Read.
 */
export function sidebarHomePath(canOpenDashboard: boolean): string {
  return canOpenDashboard ? "/app/dashboard" : APP_HOME;
}

/** What the viewer's Role lets the main menu show. */
export type MainMenuAccess = {
  /** Dashboard Read: without it the Dashboard is not in the menu. */
  canOpenDashboard: boolean;
  /** Team Members or Role Management Read (ADR CM-0030, ADR CM-0034). */
  canOpenStaffRoles: boolean;
  /** The Marketing entries the Role opens; none leaves Marketing out (ADR CM-0040). */
  marketing: MarketingMenuAccess;
};

export type MainMenuArea = {
  item: AppNavItem;
  /**
   * Where the area's own link goes (Human Resources opens on Labour or
   * HRMS, Marketing on the first entry the viewer may open).
   */
  href: string;
  /** The submenu; undefined for an area that is one page. */
  groups?: readonly AreaNavGroup[];
};

/**
 * The main menu the viewer may see, in order: the one list behind the
 * sidebar's main menu and Home (ADR CM-0039).
 */
export function mainMenuAreas({
  canOpenDashboard,
  canOpenStaffRoles,
  marketing,
}: MainMenuAccess): MainMenuArea[] {
  return APP_NAV.flatMap((item): MainMenuArea[] => {
    switch (item.href) {
      case "/app/dashboard":
        return canOpenDashboard ? [{ item, href: item.href }] : [];
      case "/app/marketing": {
        const first = marketingSections(marketing)[0];
        return first == null
          ? []
          : [{ item, href: first.href, groups: marketingGroups(marketing) }];
      }
      case "/app/staff":
        return [
          {
            item,
            href: canOpenStaffRoles ? LABOURS_PAGE_PATH : HRMS_PATH,
            groups: humanResourcesGroups(canOpenStaffRoles),
          },
        ];
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
    if (area.groups == null)
      return labelMatches(area.item.label, query)
        ? [{ area, match: null }]
        : [];
    const match = filterMenuArea(area.item.label, area.groups, query);
    return match == null ? [] : [{ area, match }];
  });
}
