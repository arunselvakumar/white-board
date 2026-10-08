import type { Metadata } from "next";

import { AppAreaPage } from "@/components/app-shell/app-area-page";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <AppAreaPage href="/app/projects" />;
}
