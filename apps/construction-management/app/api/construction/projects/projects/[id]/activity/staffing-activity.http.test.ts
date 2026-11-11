import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getLabourActivity } from "@/app/api/construction/labour/labours/[id]/activity/route";
import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as createSiteEngineer } from "@/app/api/construction/masters/site-engineers/route";
import { POST as removeLabour } from "@/app/api/construction/projects/projects/[id]/resources/labours/[labourId]/remove/route";
import { POST as addLabours } from "@/app/api/construction/projects/projects/[id]/resources/labours/route";
import { POST as setSiteEngineers } from "@/app/api/construction/projects/projects/[id]/resources/site-engineers/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN, newEmail, newMobile } from "@/test/sessions";

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
  labours?: Named[];
  siteEngineer?: Named;
};
type LabourEntry = {
  kind: string;
  date: string;
  remark?: string | null;
  project?: { id: string; name: string };
};

async function ok<T>(response: Response, status: number = StatusCodes.OK) {
  if (response.status !== status)
    throw new Error(`${String(response.status)}: ${await response.text()}`);
  return (status === StatusCodes.NO_CONTENT ? undefined : response.json()) as T;
}

async function labour(company: Company, name: string) {
  const created = await ok<{ id: string }>(
    await createLabour(
      jsonRequest(`${API}/labour/labours`, company.cookie, {
        name,
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

function labourFeed(company: Company, labourId: string) {
  return getLabourActivity(
    jsonRequest(
      `${API}/labour/labours/${labourId}/activity?type=projects`,
      company.cookie,
    ),
    { params: Promise.resolve({ id: labourId }) },
  );
}

/**
 * The Resources saves (ADR CM-0038 §2, §3) and the feeds that read their
 * history (§1), end to end: one Add Labours save is one Project entry, a
 * removal sits on its Last day, and a Site Engineers save shows as added
 * and removed.
 */
describe("Project staffing in the Activity feeds", () => {
  it("shows Resources' adds and removes in the Project and Labour feeds", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(
      company.workspaceId,
      company.userId,
      "Sky Towers",
    );
    const [ravi, selvi] = await Promise.all([
      labour(company, "Ravi"),
      labour(company, "Selvi"),
    ]);
    const params = { params: Promise.resolve({ id: sky }) };

    await ok(
      await addLabours(
        jsonRequest(
          `${API}/projects/projects/${sky}/resources/labours`,
          company.cookie,
          { labourIds: [ravi, selvi], from: day(-10), remark: "Slab work" },
        ),
        params,
      ),
      StatusCodes.NO_CONTENT,
    );
    await ok(
      await removeLabour(
        jsonRequest(
          `${API}/projects/projects/${sky}/resources/labours/${selvi}/remove`,
          company.cookie,
          { lastDay: day(-2), remark: "Slab done" },
        ),
        { params: Promise.resolve({ id: sky, labourId: selvi }) },
      ),
      StatusCodes.NO_CONTENT,
    );

    const engineer = await ok<{ id: string }>(
      await createSiteEngineer(
        jsonRequest(`${API}/masters/site-engineers`, company.cookie, {
          name: "Karthik",
          mobile: newMobile(),
          email: newEmail(),
          projectIds: [],
          profile: {},
          signIn: { invite: false, password: "first-pass-1234" },
        }),
      ),
      StatusCodes.CREATED,
    );
    const resources = `${API}/projects/projects/${sky}/resources/site-engineers`;
    await ok(
      await setSiteEngineers(
        jsonRequest(resources, company.cookie, {
          ids: [engineer.id],
          expectedIds: [],
        }),
        params,
      ),
    );
    await ok(
      await setSiteEngineers(
        jsonRequest(resources, company.cookie, {
          ids: [],
          expectedIds: [engineer.id],
        }),
        params,
      ),
    );

    const project = await ok<{ items: ProjectEntry[] }>(
      await projectFeed(company, sky),
    );
    const summary = project.items.map((entry) => [
      entry.kind,
      entry.date,
      ...(entry.labours?.map((person) => person.name).sort() ?? [
        entry.siteEngineer?.name,
      ]),
    ]);
    expect(summary).toEqual(
      expect.arrayContaining([
        ["labour_added", day(-10), "Ravi", "Selvi"],
        ["labour_removed", day(-2), "Selvi"],
        ["site_engineer_added", TODAY, "Karthik"],
        ["site_engineer_removed", TODAY, "Karthik"],
      ]),
    );
    expect(project.items).toHaveLength(4);
    expect(
      project.items.find((entry) => entry.kind === "labour_added")?.remark,
    ).toBe("Slab work");

    const selviFeed = await ok<{ items: LabourEntry[] }>(
      await labourFeed(company, selvi),
    );
    expect(
      selviFeed.items.map((entry) => [
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
