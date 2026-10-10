import type { Metadata } from "next";

import { MaterialsComingSoon } from "@/components/procurement/materials-hub/coming-soon";

export const metadata: Metadata = { title: "Current Inventory" };

export default function Page() {
  return <MaterialsComingSoon title="Current Inventory" ticket="CM-506" />;
}
