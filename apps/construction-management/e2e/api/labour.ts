import type { ApiClient } from "./ApiClient";
import { todayInIndia } from "./dates";
import { roleId } from "./organization";

export { todayInIndia } from "./dates";
import { unique } from "./session";

const LABOUR = "/api/construction/labour";

/**
 * A daily-wage Employee on `projectId` (or on no Project), working every day
 * of the week, on the Labour Role (Human Resources) unless `role` names
 * another (ADR CM-0055).
 */
export async function createEmployee(
  api: ApiClient,
  input: {
    projectId: string | null;
    name?: string;
    wagePerDayRupees?: number;
    joiningDate?: string;
    /** A Role's name: "Labour" when left out. */
    role?: string;
  },
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Ravi Kumar");
  const created = await api.post<{ item?: { id: string }; id?: string }>(
    `${LABOUR}/employees`,
    {
      name,
      roleId: await roleId(api, input.role ?? "Labour"),
      joiningDate: input.joiningDate ?? todayInIndia(-30),
      wageType: "daily",
      wagePerDay: (input.wagePerDayRupees ?? 800) * 100,
      overtimeWagePerHour: 0,
      weeklyHolidays: [],
      projectIds: input.projectId == null ? [] : [input.projectId],
    },
  );
  return { id: created.item?.id ?? created.id ?? "", name };
}

/** Marks Employees present (or another status) on `date` on the Project. */
export async function markEmployeeAttendance(
  api: ApiClient,
  input: {
    projectId: string;
    date: string;
    employeeIds: string[];
    status?: "present" | "half_day" | "absent";
  },
): Promise<void> {
  await api.post(`${LABOUR}/attendance/labour/mark`, {
    projectId: input.projectId,
    date: input.date,
    marks: input.employeeIds.map((employeeId) => ({
      employeeId,
      status: input.status ?? "present",
    })),
  });
}
