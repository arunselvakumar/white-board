import type { Metadata } from "next";

import { EmployeePage } from "@/app/app/staff/employees/[id]/_components/employee-page";
import { EmployeeFormSkeleton } from "@/app/app/staff/employees/_components/employees-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Employee" };

export default async function EmployeeRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<EmployeeFormSkeleton />}>
      <EmployeePage id={id} />
    </QuerySuspense>
  );
}
