import type { Metadata } from "next";

import { SiteWorkComingSoon } from "@/components/site-work/site-work-coming-soon";

export const metadata: Metadata = { title: "Equipment Usage sheets" };

/** The Project's Equipment Usage sheets (CM-604). */
export default function EquipmentUsageSheetsPage() {
  return <SiteWorkComingSoon title="Equipment Usage sheets" ticket="CM-604" />;
}
