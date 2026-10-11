import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { createSiteRecordQueries } from "@/src/composition/site-records";

import { POST as remove } from "./[id]/delete/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as byDate } from "./by-date/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/site-work/site-diary";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "site_work.site_diary";

type Diary = {
  id: string;
  projectId: string;
  diaryDate: string;
  weatherMorning: string | null;
  weatherAfternoon: string | null;
  rainfallMm: string | null;
  siteCondition: string | null;
  notes: string | null;
  visitors: {
    name: string;
    organisation: string | null;
    timeIn: string | null;
    timeOut: string | null;
  }[];
  instructions: { givenBy: string; instruction: string }[];
  createdBy: { userId: string; name: string | null };
  updatedAt: string;
  actions: Record<string, boolean>;
};

type ErrorBody = { code: string; details?: { field?: string } };

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (path: string) => new Request(`${BASE}${path}`);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function setup() {
  const company = await newCompany();
  const owner = { userId: company.ownerId, workspaceId: company.workspaceId };
  const projectId = await addProject(
    company.workspaceId,
    company.ownerId,
    "Tower A",
  );
  actAs({ ...owner, role: "owner" });
  return { company, owner, projectId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.company.workspaceId, ctx.company.ownerId, {
    [MENU]: flags,
  });
  if (onProject)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: ctx.projectId },
    });
  return {
    userId: added.userId,
    workspaceId: ctx.company.workspaceId,
    role: "member" as const,
  };
}

function write(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(
    post("", {
      projectId: ctx.projectId,
      diaryDate: TODAY,
      weatherMorning: "sunny",
      weatherAfternoon: "light_rain",
      rainfallMm: "4.5",
      siteCondition: "Slushy near the ramp",
      notes: "Pour postponed to tomorrow.",
      visitors: [
        {
          name: "Ravi Shankar",
          organisation: "Client",
          purpose: "Slab inspection",
          timeIn: "10:00",
          timeOut: "11:30",
        },
      ],
      instructions: [
        {
          givenBy: "Architect",
          givenTo: "Site Engineer",
          instruction: "Add chairs under the top mesh",
          actionTaken: "Done before the pour",
        },
      ],
      ...patch,
    }),
  );
}

async function backdatedPolicy(ctx: Ctx) {
  await prisma.constructionOrganizationBackdatedEntryPolicy.create({
    data: {
      id: newId(),
      workspaceId: ctx.company.workspaceId,
      createDays: 0,
      createOverrideDesignationIds: [],
      editDays: 0,
      editOverrideDesignationIds: [],
      modules: {
        site_diary: {
          mode: "custom",
          create: { days: 3, overrideDesignationIds: [] },
          edit: { days: 3, overrideDesignationIds: [] },
        },
      },
      createdBy: ctx.company.ownerId,
      updatedBy: ctx.company.ownerId,
    },
  });
}

describe("Site Diary", () => {
  it("writes, reads by id and by date, and lists the dates", async () => {
    const ctx = await setup();
    const response = await write(ctx);
    expect(response.status).toBe(StatusCodes.CREATED);
    const diary = await json<Diary>(response);
    expect(diary).toMatchObject({
      diaryDate: TODAY,
      weatherMorning: "sunny",
      weatherAfternoon: "light_rain",
      rainfallMm: "4.5",
      siteCondition: "Slushy near the ramp",
      visitors: [{ name: "Ravi Shankar", timeIn: "10:00", timeOut: "11:30" }],
      instructions: [{ givenBy: "Architect" }],
      createdBy: { userId: ctx.company.ownerId, name: "Arun Selva Kumar" },
      actions: { edit: true, delete: true, print: true },
    });

    const one = await getOne(get(`/${diary.id}`), params(diary.id));
    expect(one.status).toBe(StatusCodes.OK);

    const onDate = await json<{ date: string; diary: Diary | null }>(
      await byDate(get(`/by-date?projectId=${ctx.projectId}&date=${TODAY}`)),
    );
    expect(onDate.diary?.id).toBe(diary.id);
    const empty = await json<{ diary: Diary | null }>(
      await byDate(
        get(`/by-date?projectId=${ctx.projectId}&date=${addDays(TODAY, -1)}`),
      ),
    );
    expect(empty.diary).toBeNull();

    await write(ctx, { diaryDate: addDays(TODAY, -2), visitors: [] });
    const days = await json<{
      items: { diaryDate: string; visitorCount: number }[];
    }>(
      await list(
        get(
          `?projectId=${ctx.projectId}&from=${addDays(TODAY, -30)}&to=${TODAY}`,
        ),
      ),
    );
    expect(days.items.map((d) => [d.diaryDate, d.visitorCount])).toEqual([
      [TODAY, 1],
      [addDays(TODAY, -2), 0],
    ]);
  });

  it("allows one diary per Project per date", async () => {
    const ctx = await setup();
    expect((await write(ctx)).status).toBe(StatusCodes.CREATED);
    const second = await write(ctx);
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(second)).code).toBe("SITE_DIARY_EXISTS");

    // Another Project may have one that day.
    const other = await addProject(
      ctx.company.workspaceId,
      ctx.company.ownerId,
    );
    expect((await write({ ...ctx, projectId: other })).status).toBe(
      StatusCodes.CREATED,
    );

    // Moving another diary onto a taken date is refused too.
    const yesterday = await json<Diary>(
      await write(ctx, { diaryDate: addDays(TODAY, -1) }),
    );
    const moved = await update(
      post(`/${yesterday.id}/update`, {
        diaryDate: TODAY,
        expectedUpdatedAt: yesterday.updatedAt,
      }),
      params(yesterday.id),
    );
    expect(moved.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(moved)).code).toBe("SITE_DIARY_EXISTS");
  });

  it("frees the date when a diary is deleted", async () => {
    const ctx = await setup();
    const diary = await json<Diary>(await write(ctx));
    const stale = await remove(
      post(`/${diary.id}/delete`, {
        expectedUpdatedAt: new Date(0).toISOString(),
      }),
      params(diary.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    const gone = await remove(
      post(`/${diary.id}/delete`, { expectedUpdatedAt: diary.updatedAt }),
      params(diary.id),
    );
    expect(gone.status).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(get(`/${diary.id}`), params(diary.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await write(ctx)).status).toBe(StatusCodes.CREATED);
  });

  it("validates visitor times and required row fields", async () => {
    const ctx = await setup();
    const badTime = await write(ctx, {
      visitors: [{ name: "Ravi", timeIn: "9.30" }],
    });
    expect(badTime.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(badTime)).toMatchObject({
      code: "SITE_DIARY_TIME_INVALID",
      details: { field: "visitors.0.timeIn" },
    });
    const backwards = await write(ctx, {
      visitors: [
        { name: "Ravi", timeIn: "09:00", timeOut: "10:00" },
        { name: "Meena", timeIn: "15:00", timeOut: "14:30" },
      ],
    });
    expect(backwards.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(backwards)).toMatchObject({
      code: "SITE_DIARY_TIME_OUT_BEFORE_IN",
      details: { field: "visitors.1.timeOut" },
    });
    const noName = await write(ctx, { visitors: [{ name: "  " }] });
    expect((await json<ErrorBody>(noName)).code).toBe(
      "SITE_DIARY_VISITOR_NAME_REQUIRED",
    );
    const noInstruction = await write(ctx, {
      instructions: [{ givenBy: "PMC", instruction: "" }],
    });
    expect((await json<ErrorBody>(noInstruction)).code).toBe(
      "SITE_DIARY_INSTRUCTION_REQUIRED",
    );
    const rain = await write(ctx, { rainfallMm: "-1" });
    expect((await json<ErrorBody>(rain)).code).toBe(
      "SITE_DIARY_RAINFALL_INVALID",
    );
    const future = await write(ctx, { diaryDate: addDays(TODAY, 1) });
    expect((await json<ErrorBody>(future)).code).toBe(
      "SITE_DIARY_DATE_IN_FUTURE",
    );
    const tooMany = await write(ctx, {
      visitors: Array.from({ length: 51 }, () => ({ name: "A" })),
    });
    expect(tooMany.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("replaces the rows as a set and checks the concurrency token", async () => {
    const ctx = await setup();
    const diary = await json<Diary>(await write(ctx));
    const saved = await update(
      post(`/${diary.id}/update`, {
        diaryDate: TODAY,
        weatherMorning: "cloudy",
        visitors: [
          { name: "Meena", timeIn: "14:00" },
          { name: "Kumar", organisation: "PMC" },
        ],
        instructions: [],
        expectedUpdatedAt: diary.updatedAt,
      }),
      params(diary.id),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    const body = await json<Diary>(saved);
    expect(body.visitors.map((v) => v.name)).toEqual(["Meena", "Kumar"]);
    expect(body.instructions).toEqual([]);
    expect(body.weatherAfternoon).toBeNull();
    expect(body.rainfallMm).toBeNull();

    const stale = await update(
      post(`/${diary.id}/update`, {
        diaryDate: TODAY,
        expectedUpdatedAt: diary.updatedAt,
      }),
      params(diary.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(stale)).code).toBe("SITE_DIARY_CHANGED");
  });

  it("applies the back-dated limit on create and edit", async () => {
    const ctx = await setup();
    const old = await json<Diary>(
      await write(ctx, { diaryDate: addDays(TODAY, -10) }),
    );
    await backdatedPolicy(ctx);
    actAs(await member(ctx, ["read", "create", "update", "delete"]));
    const created = await write(ctx, { diaryDate: addDays(TODAY, -9) });
    expect(created.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(created)).code).toBe(
      "BACKDATED_CREATE_BLOCKED",
    );
    expect((await write(ctx, { diaryDate: addDays(TODAY, -2) })).status).toBe(
      StatusCodes.CREATED,
    );

    const edited = await update(
      post(`/${old.id}/update`, {
        diaryDate: old.diaryDate,
        notes: "Late note",
        expectedUpdatedAt: old.updatedAt,
      }),
      params(old.id),
    );
    expect(edited.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(edited)).code).toBe("BACKDATED_EDIT_BLOCKED");

    const recent = await json<Diary>(
      await write(ctx, { diaryDate: addDays(TODAY, -1) }),
    );
    const movedBack = await update(
      post(`/${recent.id}/update`, {
        diaryDate: addDays(TODAY, -20),
        expectedUpdatedAt: recent.updatedAt,
      }),
      params(recent.id),
    );
    expect((await json<ErrorBody>(movedBack)).code).toBe(
      "BACKDATED_EDIT_BLOCKED",
    );
  });

  it("follows the Permission Matrix on the Project", async () => {
    const ctx = await setup();
    const diary = await json<Diary>(await write(ctx));

    actAs(await member(ctx, ["read"]));
    expect((await write(ctx, { diaryDate: addDays(TODAY, -1) })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const read = await json<Diary>(
      await getOne(get(`/${diary.id}`), params(diary.id)),
    );
    expect(read.actions).toEqual({ edit: false, delete: false, print: false });
    expect(
      (
        await update(
          post(`/${diary.id}/update`, {
            diaryDate: TODAY,
            expectedUpdatedAt: diary.updatedAt,
          }),
          params(diary.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    actAs(await member(ctx, ["read", "create"], false));
    expect((await getOne(get(`/${diary.id}`), params(diary.id))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("gives the DPR the diary for a date", async () => {
    const ctx = await setup();
    await write(ctx);
    const reads = createSiteRecordQueries();
    const diary = await reads.diaryForDate(
      ctx.company.workspaceId,
      ctx.projectId,
      TODAY,
    );
    expect(diary).toMatchObject({
      diaryDate: TODAY,
      weatherMorning: { value: "sunny", label: "Sunny" },
      weatherAfternoon: { value: "light_rain", label: "Light rain" },
      rainfallMm: "4.5",
      visitors: [{ name: "Ravi Shankar" }],
    });
    expect(
      await reads.diaryForDate(
        ctx.company.workspaceId,
        ctx.projectId,
        addDays(TODAY, -1),
      ),
    ).toBeNull();
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/site-work/site-diary",
      "/api/construction/site-work/site-diary/by-date",
      "/api/construction/site-work/site-diary/{id}",
      "/api/construction/site-work/site-diary/{id}/update",
      "/api/construction/site-work/site-diary/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
