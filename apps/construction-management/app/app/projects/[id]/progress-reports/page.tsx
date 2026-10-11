import type { Metadata } from "next";

import { SiteWorkComingSoon } from "@/components/site-work/site-work-coming-soon";

export const metadata: Metadata = { title: "Progress Reports" };

export default function ProgressReportsPage() {
  return <SiteWorkComingSoon title="Progress Reports" ticket="CM-606" />;
}
