import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { mainMenuAccess } from "@/app/app/_lib/main-menu-access";
import { marketingSections } from "@/lib/marketing-nav";

import { MarketingNoAccess } from "./_components/marketing-no-access";
import { MarketingSectionPage } from "./_components/marketing-section-page";

export const metadata: Metadata = { title: "Marketing Dashboard" };

/**
 * Marketing opens on its Dashboard, or on the first entry the Role opens
 * when the Dashboard is not one of them (ADR CM-0040 §1).
 */
export default async function Page() {
  const { marketing } = await mainMenuAccess();
  if (!marketing.dashboard) {
    const first = marketingSections(marketing)[0];
    if (first == null) return <MarketingNoAccess what="Marketing" />;
    redirect(first.href);
  }
  return <MarketingSectionPage section="dashboard" />;
}
