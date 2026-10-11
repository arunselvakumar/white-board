import type { Metadata } from "next";

import { SiteWorkComingSoon } from "@/components/site-work/site-work-coming-soon";

export const metadata: Metadata = { title: "Work Types" };

export default function WorkTypesPage() {
  return <SiteWorkComingSoon title="Work Types" ticket="CM-601" />;
}
