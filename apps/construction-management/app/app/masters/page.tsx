import type { Metadata } from "next";

import { AppAreaPage } from "@/components/app-shell/app-area-page";

export const metadata: Metadata = { title: "Masters" };

export default function MastersPage() {
  return <AppAreaPage href="/app/masters" />;
}
