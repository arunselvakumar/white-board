import type { ApiClient } from "./ApiClient";
import { todayInIndia } from "./dates";

export { todayInIndia } from "./dates";
import { unique } from "./session";

const LABOUR = "/api/construction/labour";

/** A daily-wage Labour on `projectId`, working every day of the week. */
export async function createLabour(
  api: ApiClient,
  input: {
    projectId: string;
    name?: string;
    wagePerDayRupees?: number;
    joiningDate?: string;
  },
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Ravi Kumar");
  const created = await api.post<{ item?: { id: string }; id?: string }>(
    `${LABOUR}/labours`,
    {
      name,
      joiningDate: input.joiningDate ?? todayInIndia(-30),
      wageType: "daily",
      wagePerDay: (input.wagePerDayRupees ?? 800) * 100,
      overtimeWagePerHour: 0,
      weeklyHolidays: [],
      projectIds: [input.projectId],
    },
  );
  return { id: created.item?.id ?? created.id ?? "", name };
}

/** Marks Labours present (or another status) on `date` on the Project. */
export async function markLabourAttendance(
  api: ApiClient,
  input: {
    projectId: string;
    date: string;
    labourIds: string[];
    status?: "present" | "half_day" | "absent";
  },
): Promise<void> {
  await api.post(`${LABOUR}/attendance/labour/mark`, {
    projectId: input.projectId,
    date: input.date,
    marks: input.labourIds.map((labourId) => ({
      labourId,
      status: input.status ?? "present",
    })),
  });
}
