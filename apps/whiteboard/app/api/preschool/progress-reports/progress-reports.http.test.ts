import { randomUUID } from "node:crypto";

import { clearOutbox, emailsTo } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ChildProgressReportsView,
  ClassroomProgressReportsView,
  ProgressReportView,
} from "@/src/preschool/application/progress-report-views";
import { fromIsoDate } from "@/src/preschool/domain/dates";
import type {
  PreschoolChildProgressReports,
  PreschoolClassroomProgressReports,
  PreschoolProgressReport,
} from "@/src/queries/preschool/progress-reports";

import {
  addChild,
  addClassroom,
  addStaff,
  FIXTURE_NOW,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as publish } from "./[id]/publish/route";
import { GET as getReport } from "./[id]/route";
import { POST as unpublish } from "./[id]/unpublish/route";
import { GET as childReports } from "./children/[childId]/route";
import { PreschoolProgressReportModel } from "./progress-report-models";
import { GET as classroom } from "./route";
import { POST as save } from "./save/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<ProgressReportView, PreschoolProgressReport>,
  Same<ClassroomProgressReportsView, PreschoolClassroomProgressReports>,
  Same<ChildProgressReportsView, PreschoolChildProgressReports>,
] = [true, true, true];

type Json = Record<string, unknown> & { code?: string; details?: unknown };
type Result<T> = { status: number; body: T };
type Context = { params: Promise<{ id: string; childId: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

async function call<T = Json>(
  handler: Handler,
  input: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api/preschool/progress-reports");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const response = await handler(
    new Request(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    {
      params: Promise.resolve({ id: input.id ?? "", childId: input.id ?? "" }),
    },
  );
  return {
    status: response.status,
    body: (await response.json()) as Json as T,
  };
}

describe("/api/preschool/progress-reports", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let roomA: string;
  let asha: string;
  let bala: string;
  let reportId: string;

  const teacherA = () => {
    signInWithEmail(preschool, "teacher", "teacher-a@example.test");
  };
  const ratings = (count: number) =>
    preschool.domainIds.slice(0, count).map((domainId, index) => ({
      domainId,
      rating: (["beginning", "progressing", "proficient"] as const)[index % 3],
      remark: index === 0 ? "Runs and jumps with ease" : null,
    }));

  async function attend(date: string, status: "present" | "absent") {
    await prisma.preschoolAttendance.create({
      data: {
        id: randomUUID(),
        workspaceId: preschool.workspaceId,
        centreId: preschool.centreId,
        classroomId: roomA,
        childId: asha,
        date: fromIsoDate(date),
        status,
        markedByUserId: "user_seed",
      },
    });
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);
    preschool = await seedPreschool();
    other = await seedPreschool({ name: "Other Preschool" });
    roomA = await addClassroom(preschool, { name: "Nursery A" });
    const roomB = await addClassroom(preschool, { name: "Nursery B" });
    ({ childId: asha } = await addChild(preschool, {
      classroomId: roomA,
      firstName: "Asha",
      motherEmail: "asha-mother@example.test",
    }));
    ({ childId: bala } = await addChild(preschool, {
      classroomId: roomB,
      firstName: "Bala",
      motherEmail: "bala-mother@example.test",
    }));
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher-a@example.test",
      classroomIds: [roomA],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher-b@example.test",
      classroomIds: [roomB],
    });
    for (const date of ["2026-08-04", "2026-09-10", "2026-11-24"])
      await attend(date, "present");
    await attend("2026-10-02", "absent");
    await attend("2026-07-15", "present");
    await prisma.preschoolObservation.create({
      data: {
        id: randomUUID(),
        workspaceId: preschool.workspaceId,
        centreId: preschool.centreId,
        childId: asha,
        domainId: preschool.domainIds[0] ?? "",
        observedOn: fromIsoDate("2026-10-12"),
        note: "Hopped on one foot",
        createdByUserId: "user_seed",
        createdByName: "Kavya",
      },
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("serves the shapes the client module is typed with", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("lists the Classroom's roster with no reports yet", async () => {
    teacherA();
    const result = await call<ClassroomProgressReportsView>(classroom, {
      query: { classroomId: roomA, term: "term_2" },
    });
    expect(result.body).toMatchObject({
      academicYear: { id: preschool.academicYearId, name: "2026–27" },
      term: {
        label: "Term 2",
        startsOn: "2026-08-01",
        endsOn: "2026-11-30",
      },
      counts: { none: 1, draft: 0, published: 0 },
      children: [{ childId: asha, status: "none", reportId: null }],
    });
  });

  it("saves a draft, refuses to publish it until every Domain is rated", async () => {
    teacherA();
    const draft = await call<ProgressReportView>(save, {
      body: { childId: asha, term: "term_2", ratings: ratings(2) },
    });
    expect(draft.status).toBe(StatusCodes.OK);
    expect(PreschoolProgressReportModel.parse(draft.body)).toBeTruthy();
    reportId = draft.body.id;
    expect(draft.body).toMatchObject({
      status: "draft",
      centre: { name: "Little Steps" },
      child: {
        name: "Asha",
        classroomName: "Nursery A",
        programmeName: "Nursery (Pre-KG)",
      },
      attendance: { present: 3, marked: 4 },
    });
    expect(draft.body.ratings).toHaveLength(6);
    expect(draft.body.ratings[0]).toMatchObject({
      rating: "beginning",
      remark: "Runs and jumps with ease",
    });
    expect(draft.body.ratings[2]?.rating).toBeNull();
    expect(draft.body.observations?.[0]?.items).toMatchObject([
      { note: "Hopped on one foot", observedOn: "2026-10-12" },
    ]);

    const incomplete = await call(publish, { id: reportId });
    expect(incomplete.status).toBe(StatusCodes.CONFLICT);
    expect(incomplete.body.code).toBe("PROGRESS_REPORT_INCOMPLETE");
    expect(
      (incomplete.body.details as { missingDomainIds: string[] })
        .missingDomainIds,
    ).toHaveLength(4);

    const repeated = await call(save, {
      body: {
        childId: asha,
        term: "term_2",
        ratings: [...ratings(1), ...ratings(1)],
      },
    });
    expect(repeated.body.code).toBe("RATING_REPEATED");
  });

  it("publishes a complete report and emails the Parents", async () => {
    teacherA();
    clearOutbox();
    await call(save, {
      body: {
        childId: asha,
        term: "term_2",
        ratings: ratings(6),
        teacherRemarks: "A cheerful term.",
      },
    });
    const published = await call<ProgressReportView>(publish, { id: reportId });
    expect(published.status).toBe(StatusCodes.OK);
    expect(published.body.status).toBe("published");
    expect(published.body.publishedAt).toBe(FIXTURE_NOW.toISOString());
    expect(emailsTo("asha-mother@example.test")[0]?.subject).toBe(
      "Asha's Term 2 Progress Report is ready",
    );
    expect((await call(publish, { id: reportId })).body.code).toBe(
      "PROGRESS_REPORT_PUBLISHED",
    );

    const corrected = await call<ProgressReportView>(save, {
      body: {
        childId: asha,
        term: "term_2",
        ratings: ratings(6),
        teacherRemarks: "A cheerful, curious term.",
      },
    });
    expect(corrected.body).toMatchObject({
      status: "published",
      teacherRemarks: "A cheerful, curious term.",
    });
  });

  it("keeps a Teacher to their own Classroom", async () => {
    signInWithEmail(preschool, "teacher", "teacher-b@example.test");
    expect(
      (
        await call(save, {
          body: { childId: asha, term: "term_2", ratings: [] },
        })
      ).body.code,
    ).toBe("CHILD_FORBIDDEN");
    expect((await call(getReport, { id: reportId })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (
        await call(classroom, {
          query: { classroomId: roomA, term: "term_2" },
        })
      ).body.code,
    ).toBe("CLASSROOM_FORBIDDEN");
  });

  it("shows a Parent only their own Child's published reports, without Observations", async () => {
    teacherA();
    const draft = await call<ProgressReportView>(save, {
      body: { childId: asha, term: "term_1", ratings: ratings(1) },
    });
    const staffList = await call<ChildProgressReportsView>(childReports, {
      id: asha,
    });
    expect(staffList.body.items.map((item) => item.term.term)).toEqual([
      "term_2",
      "term_1",
    ]);

    signInWithEmail(preschool, "parent", "asha-mother@example.test");
    const parentList = await call<ChildProgressReportsView>(childReports, {
      id: asha,
    });
    expect(parentList.body.items.map((item) => item.id)).toEqual([reportId]);
    const read = await call<ProgressReportView>(getReport, { id: reportId });
    expect(read.status).toBe(StatusCodes.OK);
    expect(read.body.observations).toBeNull();
    expect(read.body.teacherRemarks).toBe("A cheerful, curious term.");
    expect((await call(getReport, { id: draft.body.id })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await call(save, { body: {} })).status).toBe(StatusCodes.FORBIDDEN);

    signInWithEmail(preschool, "parent", "bala-mother@example.test");
    expect((await call(getReport, { id: reportId })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await call(childReports, { id: asha })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(bala).not.toBe(asha);
  });

  it("lets managers unpublish, and answers 404 across Workspaces", async () => {
    teacherA();
    expect((await call(unpublish, { id: reportId })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    signInAsOwner(preschool);
    const draft = await call<ProgressReportView>(unpublish, { id: reportId });
    expect(draft.body).toMatchObject({ status: "draft", publishedAt: null });

    signInAsOwner(other);
    expect((await call(getReport, { id: reportId })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (
        await call(save, {
          body: { childId: asha, term: "term_2", ratings: [] },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });
});
