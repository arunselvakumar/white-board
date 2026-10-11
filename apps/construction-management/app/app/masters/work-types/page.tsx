import type { Metadata } from "next";

import { WorkTypesList } from "@/components/masters/work-types-list";

export const metadata: Metadata = { title: "Work Types" };

export default function WorkTypesPage() {
  return <WorkTypesList />;
}
