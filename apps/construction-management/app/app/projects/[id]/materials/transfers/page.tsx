import type { Metadata } from "next";

import { MaterialsComingSoon } from "@/components/procurement/materials-hub/coming-soon";

export const metadata: Metadata = { title: "Material Transfers" };

export default function Page() {
  return <MaterialsComingSoon title="Material Transfers" ticket="CM-507" />;
}
