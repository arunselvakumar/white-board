import type { Metadata } from "next";

import { SupervisorsList } from "@/app/app/staff/site-engineers/_components/supervisors-list";

export const metadata: Metadata = { title: "Site Engineers" };

export default function SupervisorsPage() {
  return <SupervisorsList />;
}
