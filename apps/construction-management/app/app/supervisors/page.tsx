import type { Metadata } from "next";

import { SupervisorsList } from "@/components/masters/supervisors-list";

export const metadata: Metadata = { title: "Supervisors" };

export default function SupervisorsPage() {
  return <SupervisorsList />;
}
