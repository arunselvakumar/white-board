import type { Metadata } from "next";

import { SiteWorkComingSoon } from "@/components/site-work/site-work-coming-soon";

export const metadata: Metadata = { title: "Equipment" };

export default function EquipmentPage() {
  return <SiteWorkComingSoon title="Equipment" ticket="CM-604" />;
}
