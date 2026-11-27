import type { Metadata } from "next";

import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";
import { NewEmployeeScreen } from "@/app/app/staff/employees/_components/employee-form";
import { EmployeeFormSkeleton } from "@/app/app/staff/employees/_components/employees-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

import { viewerFlags } from "../../../_lib/viewer-can";

export const metadata: Metadata = { title: "Add Employee" };

/** The Bank card needs Financial on Employees (`masters.labours`). */
export default async function NewEmployeePage() {
  const can = await viewerFlags("masters.labours", ["create", "financial"]);
  if (!can.create) return <RolesNoAccess what="adding Employees" />;
  return (
    <QuerySuspense fallback={<EmployeeFormSkeleton />}>
      <NewEmployeeScreen canSeeBank={can.financial} />
    </QuerySuspense>
  );
}
