import type { Metadata } from "next";

import { SupervisorsList } from "@/components/masters/supervisors-list";

export const metadata: Metadata = { title: "Site Engineers" };

export default function SupervisorsPage() {
  return <SupervisorsList />;
}
