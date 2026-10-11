import type { Metadata } from "next";

import { SiteWorkComingSoon } from "@/components/site-work/site-work-coming-soon";

export const metadata: Metadata = { title: "Daily Worksheet" };

export default function WorksheetsPage() {
  return <SiteWorkComingSoon title="Daily Worksheet" ticket="CM-602" />;
}
