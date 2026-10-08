import type { Metadata } from "next";

import { DepartmentsList } from "@/components/masters/lookup-list";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return <DepartmentsList />;
}
