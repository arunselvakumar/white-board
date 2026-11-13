import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";

import { MarketingNoAccess } from "../_components/marketing-no-access";
import { MarketingReportsPage } from "./_components/marketing-reports-page";

export const metadata: Metadata = { title: "Marketing Reports" };

/**
 * The three Marketing Reports (ADR CM-0040 §13). Needs Report on Visits;
 * like Central Reports, the cards read the catalogue in the browser.
 */
export default async function Page() {
  if (!(await viewerCan("marketing.visits", "report")))
    return <MarketingNoAccess what="Marketing Reports" />;
  return <MarketingReportsPage />;
}
