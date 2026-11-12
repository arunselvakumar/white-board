"use client";

import {
  MARKETING_PATH,
  activeMarketingSection,
  marketingSections,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";

/** The Marketing submenu: the entries the viewer may open, in one group. */
export function marketingGroups(
  access: MarketingMenuAccess,
): readonly AreaNavGroup[] {
  const sections = marketingSections(access);
  return sections.length === 0 ? [] : [{ sections }];
}

/**
 * Marketing in the sidebar (ADR CM-0040 §1): Dashboard, Visits,
 * Follow-ups, Companies, Team and Reports, each shown only when the
 * viewer's Role opens it. The area link goes to the first of them, the
 * Dashboard for most. `groups` and `forceOpen` narrow it to what the menu
 * search matches.
 */
export function MarketingNavMenu({
  pathname,
  buttonClassName,
  access,
  groups = marketingGroups(access),
  forceOpen,
}: {
  pathname: string;
  buttonClassName: string;
  access: MarketingMenuAccess;
  groups?: readonly AreaNavGroup[];
  forceOpen?: boolean;
}) {
  const first = marketingSections(access)[0]?.href ?? MARKETING_PATH;
  return (
    <AreaNavMenu
      href="/app/marketing"
      linkHref={first}
      label="Marketing"
      groups={groups}
      currentHref={activeMarketingSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
      forceOpen={forceOpen}
    />
  );
}
