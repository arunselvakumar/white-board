import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";

export const metadata: Metadata = { title: "Attendance" };

export default function ProjectAttendancePage() {
  return (
    <PagePlaceholder
      title="Attendance"
      description="Mark labour and vendor attendance for this Project. Arrives with CM-211."
      icon={CalendarCheck}
    />
  );
}
