import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getEmployeeActivity } from "@/app/api/construction/labour/employees/[id]/activity/route";
import { POST as createEmployee } from "@/app/api/construction/labour/employees/route";
import { POST as removeEmployee } from "@/app/api/construction/projects/projects/[id]/resources/employees/[employeeId]/remove/route";
import { POST as addEmployees } from "@/app/api/construction/projects/projects/[id]/resources/employees/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getProjectActivity } from "./route";

const API = `${TEST_ORIGIN}/api/construction`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Named = { id: string | null; name: string };
type ProjectEntry = {
  kind: string;
  date: string;
  remark?: string | null;
  employees?: (Named & { role: string | null })[];
};
type EmployeeEntry = {
  kind: string;
  date: string;
  remark?: string | null;
  project?: { id: string; name: string };
};

/** The body as `T` (none for 204), or throws with the response when `status` differs. */
async function ok<T>(response: Response, status: number = StatusCodes.OK) {
  const body = await response.text();
  if (response.status !== status)
    throw new Error(`${String(response.status)}: ${body}`);
  return (body === "" ? undefined : JSON.parse(body)) as T;
}

async function employee(company: Company, name: string, role: string) {
  const created = await ok<{ id: string }>(
    await createEmployee(
      jsonRequest(`${API}/labour/employees`, company.cookie, {
        name,
        roleId: company.roleId(role),
        joiningDate: day(-40),
        wageType: "daily",
        wagePerDay: 70_000,
        overtimeWagePerHour: 10_000,
        weeklyHolidays: [],
        projectIds: [],
      }),
    ),
    StatusCodes.CREATED,
  );
  return created.id;
}

function projectFeed(company: Company, projectId: string) {
  return getProjectActivity(
    jsonRequest(
      `${API}/projects/projects/${projectId}/activity`,
      company.cookie,
    ),
    { params: Promise.resolve({ id: projectId }) },
  );
}

function employeeFeed(company: Company, employeeId: string) {
  return getEmployeeActivity(
    jsonRequest(
      `${API}/labour/employees/${employeeId}/activity?type=projects`,
      company.cookie,
    ),
    { params: Promise.resolve({ id: employeeId }) },
  );
}

/**
 * The Teams saves (ADR CM-0038 §2, §3, CM-0055 §5) and the feeds that read
 * their history (§1), end to end: one Add Employees save is one Project
 * entry, whatever the Employees' Roles, and a removal sits on its Last day.
 */
describe("Project staffing in the Activity feeds", () => {
  it("shows Teams' adds and removes in the Project and Employee feeds", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(
      company.workspaceId,
      company.userId,
      "Sky Towers",
    );
    const [ravi, karthik] = await Promise.all([
      employee(company, "Ravi", "Labour"),
      employee(company, "Karthik", "Site Engineer"),
    ]);
    const params = { params: Promise.resolve({ id: sky }) };

    await ok(
      await addEmployees(
        jsonRequest(
          `${API}/projects/projects/${sky}/resources/employees`,
          company.cookie,
          { employeeIds: [ravi, karthik], from: day(-10), remark: "Slab work" },
        ),
        params,
      ),
      StatusCodes.NO_CONTENT,
    );
    await ok(
      await removeEmployee(
        jsonRequest(
          `${API}/projects/projects/${sky}/resources/employees/${karthik}/remove`,
          company.cookie,
          { lastDay: day(-2), remark: "Slab done" },
        ),
        { params: Promise.resolve({ id: sky, employeeId: karthik }) },
      ),
      StatusCodes.NO_CONTENT,
    );

    const project = await ok<{ items: ProjectEntry[] }>(
      await projectFeed(company, sky),
    );
    const summary = project.items.map((entry) => [
      entry.kind,
      entry.date,
      ...(entry.employees
        ?.map((person) => `${person.name} (${person.role ?? "-"})`)
        .sort() ?? []),
    ]);
    expect(summary).toEqual([
      ["employee_removed", day(-2), "Karthik (Site Engineer)"],
      ["employee_added", day(-10), "Karthik (Site Engineer)", "Ravi (Labour)"],
    ]);
    expect(
      project.items.find((entry) => entry.kind === "employee_added")?.remark,
    ).toBe("Slab work");

    const karthikFeed = await ok<{ items: EmployeeEntry[] }>(
      await employeeFeed(company, karthik),
    );
    expect(
      karthikFeed.items.map((entry) => [
        entry.kind,
        entry.date,
        entry.project?.name,
        entry.remark,
      ]),
    ).toEqual([
      ["project_removed", day(-2), "Sky Towers", "Slab done"],
      ["project_added", day(-10), "Sky Towers", "Slab work"],
    ]);
  });
});
