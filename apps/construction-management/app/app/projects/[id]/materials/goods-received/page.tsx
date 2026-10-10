import type { Metadata } from "next";

import { MaterialsComingSoon } from "@/components/procurement/materials-hub/coming-soon";

export const metadata: Metadata = { title: "Goods Received" };

export default function Page() {
  return <MaterialsComingSoon title="Goods Received" ticket="CM-505" />;
}
