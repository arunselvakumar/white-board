import type { Metadata } from "next";

import { WorkTypesList } from "@/app/app/masters/work-types/_components/work-types-list";

export const metadata: Metadata = { title: "Work Types" };

export default function WorkTypesPage() {
  return <WorkTypesList />;
}
