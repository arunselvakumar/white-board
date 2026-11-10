import type { Metadata } from "next";

import { DepartmentsList } from "@/app/app/masters/_components/lookup-list";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return <DepartmentsList />;
}
