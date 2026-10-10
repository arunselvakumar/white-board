import { createSalaryRunHandlers } from "@/src/hrms/infrastructure/create-salary-run-handlers";

/** Salary run handlers (CM-316, CM-317), wired once for every salary route. */
export const salaryHandlers = createSalaryRunHandlers();

/** Query parameters as a plain object, for the Request models. */
export function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
