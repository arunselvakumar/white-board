import type { Metadata } from "next";

import { mainMenuAccess } from "@/app/app/_lib/main-menu-access";
import { MarketingNoAccess } from "@/app/app/marketing/_components/marketing-no-access";
import { MARKETING_DEPARTMENT, marketingGroups } from "@/lib/departments-nav";

import { DepartmentPage } from "../_components/department-page";

export const metadata: Metadata = { title: MARKETING_DEPARTMENT.label };

/**
 * Marketing (ADR CM-0046): a card per entry the viewer's Role opens
 * (ADR CM-0040 §1); a Role with none is told so.
 */
export default async function MarketingDepartmentPage() {
  const { marketing } = await mainMenuAccess();
  const groups = marketingGroups(marketing);
  if (groups.length === 0) return <MarketingNoAccess what="Marketing" />;
  return (
    <DepartmentPage
      title={MARKETING_DEPARTMENT.label}
      meta="Winning work: Visits, Follow-ups and Prospect Companies."
      groups={groups}
    />
  );
}
