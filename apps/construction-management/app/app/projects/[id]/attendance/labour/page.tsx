import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";

export const metadata: Metadata = { title: "Labour attendance" };

export default function ProjectLabourAttendancePage() {
  return (
    <PagePlaceholder
      title="Labour attendance"
      description="Mark labour attendance for this Project. Arrives with CM-211."
      icon={CalendarCheck}
    />
  );
}
