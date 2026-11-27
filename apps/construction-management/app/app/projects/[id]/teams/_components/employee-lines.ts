import { formatCalendarDate } from "@/app/app/_components/projects/project-status";

/** "Labour · E-001 · Mason": their Role, Employee Id and Labour Category. */
export function employeeDetail(employee: {
  role: { name: string };
  employeeCode: string | null;
  labourCategory: { name: string } | null;
}): string {
  return [
    employee.role.name,
    employee.employeeCode,
    employee.labourCategory?.name,
  ]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

/** "Since 2 Mar 2026". */
export function sinceLabel(since: string): string {
  return `Since ${formatCalendarDate(since)}`;
}
