import type { Metadata } from "next";

import { SiteWorkComingSoon } from "@/components/site-work/site-work-coming-soon";

export const metadata: Metadata = { title: "Equipments" };

export default function EquipmentsPage() {
  return <SiteWorkComingSoon title="Equipments" ticket="CM-603" />;
}
