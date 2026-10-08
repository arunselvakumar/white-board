import { FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";

export const metadata: Metadata = { title: "Reports" };

export default function ProjectReportsPage() {
  return (
    <PagePlaceholder
      title="Reports"
      description="Attendance and payment reports for this Project. Arrives with CM-217."
      icon={FileSpreadsheet}
    />
  );
}
