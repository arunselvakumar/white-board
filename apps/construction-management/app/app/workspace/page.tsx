import type { Metadata } from "next";

import { AppAreaPage } from "@/components/app-shell/app-area-page";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return <AppAreaPage href="/app/workspace" />;
}
