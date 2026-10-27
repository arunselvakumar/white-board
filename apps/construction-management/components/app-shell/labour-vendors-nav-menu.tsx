"use client";

import {
  LABOURS_PAGE_PATH,
  LABOUR_VENDORS_SECTIONS,
  activeLabourVendorsSection,
} from "@/lib/labour-vendors-nav";

import { AreaNavMenu } from "./area-nav-menu";

const GROUPS = [{ sections: LABOUR_VENDORS_SECTIONS }];

/** Labour & Vendors in the sidebar: Labours, Vendors and their lists. */
export function LabourVendorsNavMenu({
  pathname,
  buttonClassName,
}: {
  pathname: string;
  buttonClassName: string;
}) {
  return (
    <AreaNavMenu
      href={LABOURS_PAGE_PATH}
      label="Labour & Vendors"
      groups={GROUPS}
      currentHref={activeLabourVendorsSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
