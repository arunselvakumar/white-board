import type { Metadata } from "next";

import { EmployeesPage } from "@/app/app/staff/employees/_components/employees-page";

export const metadata: Metadata = { title: "Employees" };

export default function Page() {
  return <EmployeesPage />;
}
