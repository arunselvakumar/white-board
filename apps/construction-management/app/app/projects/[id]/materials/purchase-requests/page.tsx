import type { Metadata } from "next";

import { MaterialsComingSoon } from "@/components/procurement/materials-hub/coming-soon";

export const metadata: Metadata = { title: "Purchase Requests" };

export default function Page() {
  return <MaterialsComingSoon title="Purchase Requests" ticket="CM-503" />;
}
