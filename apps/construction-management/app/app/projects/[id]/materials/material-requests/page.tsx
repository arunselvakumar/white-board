import type { Metadata } from "next";

import { MaterialsComingSoon } from "@/components/procurement/materials-hub/coming-soon";

export const metadata: Metadata = { title: "Material Requests" };

export default function Page() {
  return <MaterialsComingSoon title="Material Requests" ticket="CM-508" />;
}
