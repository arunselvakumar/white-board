import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  EnquiryDetailView,
  EnquiryPageView,
  EnquiryPhoneMatchesView,
  EnquirySummaryView,
} from "@/src/preschool/application/enquiry-views";
import { addDays, todayInIndia } from "@/src/preschool/domain/dates";
import type {
  PreschoolEnquiryDetail,
  PreschoolEnquiryPage,
  PreschoolEnquiryPhoneMatches,
  PreschoolEnquirySummary,
} from "@/src/queries/preschool/enquiries";

import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  signOut,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as updateDetails } from "./[id]/details/route";
import { POST as logFollowUp } from "./[id]/follow-ups/route";
import { POST as markLost } from "./[id]/lost/route";
import { POST as reopen } from "./[id]/reopen/route";
import { GET as getEnquiry } from "./[id]/route";
import { POST as moveStatus } from "./[id]/status/route";
import {
  ListPreschoolEnquiriesResponseModel,
  PreschoolEnquiryDetailModel,
  PreschoolEnquiryPhoneMatchesResponseModel,
  PreschoolEnquirySummaryResponseModel,
} from "./enquiry-models";
import { GET as phoneMatches } from "./phone-matches/route";
import { GET as listEnquiries, POST as createEnquiry } from "./route";
import { GET as summary } from "./summary/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

// The client module's types are the server's views.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<EnquiryDetailView, PreschoolEnquiryDetail>,
  Same<EnquiryPageView, PreschoolEnquiryPage>,
  Same<EnquirySummaryView, PreschoolEnquirySummary>,
  Same<EnquiryPhoneMatchesView, PreschoolEnquiryPhoneMatches>,
] = [true, true, true, true];

type Json = Record<string, unknown> & { code?: string };
type Result<T> = { status: number; body: T };
type Context = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

async function call<T = Json>(
  handler: Handler,
  input: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api/preschool/enquiries");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const response = await handler(
    new Request(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    { params: Promise.resolve({ id: input.id ?? "" }) },
  );
  return { status: response.status, body: (await response.json()) as T };
}

const TODAY = todayInIndia(new Date());

describe("/api/preschool/enquiries", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let otherEnquiryId: string;
  const nursery = () => preschool.programmeIds["Nursery (Pre-KG)"];

  function form(overrides: Record<string, unknown> = {}) {
    return {
      centreId: preschool.centreId,
      childName: "Aarav",
      childDateOfBirth: "2023-03-10",
      childGender: "boy",
      parentName: "Ravi Kumar",
      parentPhone: "+91 98400 12345",
      parentEmail: "Ravi@Example.test",
      programmeId: nursery(),
      source: "walk_in",
      ...overrides,
    };
  }

  async function create(overrides: Record<string, unknown> = {}) {
    signInAsOwner(preschool);
    const result = await call<EnquiryDetailView>(createEnquiry, {
      body: form(overrides),
    });
    expect(result.status).toBe(StatusCodes.CREATED);
    return result.body;
  }

  beforeAll(async () => {
    preschool = await seedPreschool({ centres: 2 });
    other = await seedPreschool({ name: "Other Preschool" });
    const classroomId = await addClassroom(preschool);
    await addChild(preschool, {
      classroomId,
      firstName: "Isha",
      fatherPhone: "9840012345",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "head@example.test",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "branch-head@example.test",
      centreId: preschool.centreIds[1],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher@example.test",
      classroomIds: [classroomId],
    });
    signInAsOwner(other);
    const created = await call<EnquiryDetailView>(createEnquiry, {
      body: {
        centreId: other.centreId,
        childName: "Elsewhere",
        parentName: "Someone",
        parentPhone: "9000000001",
        source: "flyer",
      },
    });
    otherEnquiryId = created.body.id;
  });

  afterAll(async () => {
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("serves the shapes the client module is typed with", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("records an Enquiry with a normalised phone, the age and a first activity", async () => {
    const enquiry = await create({ nextFollowUpOn: TODAY });
    expect(PreschoolEnquiryDetailModel.parse(enquiry)).toBeTruthy();
    expect(enquiry).toMatchObject({
      status: "new",
      parentPhone: "9840012345",
      parentEmail: "ravi@example.test",
      programmeName: "Nursery (Pre-KG)",
      followUpDue: true,
    });
    expect(enquiry.childAgeText).toMatch(/^3 y/);
    expect(enquiry.activities).toMatchObject([
      { kind: "status_change", toStatus: "new", createdByName: "Owner" },
    ]);
  });

  it("refuses a phone that is not an Indian mobile number", async () => {
    signInAsOwner(preschool);
    const result = await call(createEnquiry, {
      body: form({ parentPhone: "044 2345 6789" }),
    });
    expect(result.status).toBe(StatusCodes.BAD_REQUEST);
    expect(result.body.code).toBe("PHONE_INVALID");
  });

  it("refuses Teachers and Parents, and Centre Heads of another Centre", async () => {
    const enquiry = await create();
    signInWithEmail(preschool, "teacher", "teacher@example.test");
    expect(
      (await call(listEnquiries, { query: { centreId: preschool.centreId } }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await call(getEnquiry, { id: enquiry.id })).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    signInWithEmail(preschool, "teacher", "branch-head@example.test");
    const list = await call(listEnquiries, {
      query: { centreId: preschool.centreId },
    });
    expect(list.status).toBe(StatusCodes.FORBIDDEN);
    expect(list.body.code).toBe("CENTRE_FORBIDDEN");
    const read = await call(getEnquiry, { id: enquiry.id });
    expect(read.body.code).toBe("CENTRE_FORBIDDEN");
    const write = await call(markLost, {
      id: enquiry.id,
      body: { reason: "Too far" },
    });
    expect(write.body.code).toBe("CENTRE_FORBIDDEN");
    const created = await call(createEnquiry, { body: form() });
    expect(created.body.code).toBe("CENTRE_FORBIDDEN");

    signOut();
    expect((await call(getEnquiry, { id: enquiry.id })).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("lets the Centre's Centre Head work its Enquiries", async () => {
    const enquiry = await create();
    signInWithEmail(preschool, "teacher", "head@example.test");
    const result = await call<EnquiryDetailView>(logFollowUp, {
      id: enquiry.id,
      body: { kind: "call", note: "Called back" },
    });
    expect(result.status).toBe(StatusCodes.OK);
    expect(result.body.activities[0]).toMatchObject({
      kind: "call",
      note: "Called back",
      createdByName: "head",
    });
  });

  it("answers 404 for another Workspace's Enquiry", async () => {
    signInAsOwner(preschool);
    expect((await call(getEnquiry, { id: otherEnquiryId })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const write = await call(updateDetails, {
      id: otherEnquiryId,
      body: form(),
    });
    expect(write.status).toBe(StatusCodes.NOT_FOUND);
    expect(write.body.code).toBe("ENQUIRY_NOT_FOUND");
  });

  it("moves through the pipeline, writing a status change each time", async () => {
    const enquiry = await create();
    signInAsOwner(preschool);
    const noDate = await call(moveStatus, {
      id: enquiry.id,
      body: { status: "visit_scheduled" },
    });
    expect(noDate.body.code).toBe("VISIT_DATE_REQUIRED");

    const visitOn = addDays(TODAY, 3);
    const followUp = await call<EnquiryDetailView>(logFollowUp, {
      id: enquiry.id,
      body: {
        kind: "call",
        note: "Will visit on Saturday",
        status: "visit_scheduled",
        visitOn,
        nextFollowUpOn: visitOn,
      },
    });
    expect(followUp.body).toMatchObject({
      status: "visit_scheduled",
      visitOn,
      nextFollowUpOn: visitOn,
      followUpDue: false,
    });
    expect(
      followUp.body.activities.slice(0, 2).map((entry) => entry.kind),
    ).toEqual(["status_change", "call"]);

    const visited = await call<EnquiryDetailView>(moveStatus, {
      id: enquiry.id,
      body: { status: "visited", note: "Liked the play area" },
    });
    expect(visited.body).toMatchObject({ status: "visited", visitOn: TODAY });
    expect(visited.body.activities[0]).toMatchObject({
      kind: "status_change",
      toStatus: "visited",
      note: "Liked the play area",
    });

    const same = await call(moveStatus, {
      id: enquiry.id,
      body: { status: "visited" },
    });
    expect(same.status).toBe(StatusCodes.CONFLICT);
    expect(same.body.code).toBe("ENQUIRY_STATUS_UNCHANGED");
  });

  it("marks an Enquiry lost and reopens it at the status it had", async () => {
    const enquiry = await create({ nextFollowUpOn: TODAY });
    signInAsOwner(preschool);
    await call(moveStatus, { id: enquiry.id, body: { status: "contacted" } });
    const lost = await call<EnquiryDetailView>(markLost, {
      id: enquiry.id,
      body: { reason: "Chose another school" },
    });
    expect(lost.body).toMatchObject({
      status: "lost",
      lostReason: "Chose another school",
      nextFollowUpOn: null,
      followUpDue: false,
    });

    const followUp = await call(logFollowUp, {
      id: enquiry.id,
      body: { kind: "note", note: "Still lost" },
    });
    expect(followUp.status).toBe(StatusCodes.CONFLICT);
    expect(followUp.body.code).toBe("ENQUIRY_LOST");

    const reopened = await call<EnquiryDetailView>(reopen, {
      id: enquiry.id,
      body: { nextFollowUpOn: addDays(TODAY, 1) },
    });
    expect(reopened.body).toMatchObject({
      status: "contacted",
      lostReason: null,
      nextFollowUpOn: addDays(TODAY, 1),
    });
    expect(reopened.body.activities[0]).toMatchObject({
      kind: "status_change",
      toStatus: "contacted",
    });

    const notLost = await call(reopen, { id: enquiry.id, body: {} });
    expect(notLost.body.code).toBe("ENQUIRY_NOT_LOST");
  });

  it("edits details until the Enquiry is admitted", async () => {
    const enquiry = await create();
    signInAsOwner(preschool);
    const edited = await call<EnquiryDetailView>(updateDetails, {
      id: enquiry.id,
      body: { ...form({ childName: "Aarav K", parentPhone: "09840012399" }) },
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(edited.body).toMatchObject({
      childName: "Aarav K",
      parentPhone: "9840012399",
    });
    expect(edited.body.activities[0]).toMatchObject({ kind: "note" });

    await prisma.preschoolEnquiry.update({
      where: { id: enquiry.id },
      data: { status: "admitted" },
    });
    for (const [handler, body] of [
      [updateDetails, form()],
      [logFollowUp, { kind: "note", note: "x" }],
      [moveStatus, { status: "contacted" }],
      [markLost, { reason: "x" }],
      [reopen, {}],
    ] as const) {
      const result = await call(handler, { id: enquiry.id, body });
      expect(result.status).toBe(StatusCodes.CONFLICT);
      expect(result.body.code).toBe("ENQUIRY_ADMITTED");
    }
  });

  it("refuses an archived Programme and another Workspace's Programme", async () => {
    signInAsOwner(preschool);
    const foreign = await call(createEnquiry, {
      body: form({ programmeId: other.programmeIds["LKG"] }),
    });
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(foreign.body.code).toBe("PROGRAMME_NOT_FOUND");

    const archivedId = preschool.programmeIds["Daycare"] ?? "";
    await prisma.preschoolProgramme.update({
      where: { id: archivedId },
      data: { archivedAt: new Date() },
    });
    const archived = await call(createEnquiry, {
      body: form({ programmeId: archivedId }),
    });
    await prisma.preschoolProgramme.update({
      where: { id: archivedId },
      data: { archivedAt: null },
    });
    expect(archived.status).toBe(StatusCodes.CONFLICT);
    expect(archived.body.code).toBe("PROGRAMME_ARCHIVED");
  });

  it("lists by view with followUpDue and a total, paging forward", async () => {
    const centreId = preschool.centreIds[1] ?? "";
    signInAsOwner(preschool);
    const ids: string[] = [];
    for (const [index, nextFollowUpOn] of [
      addDays(TODAY, -2),
      TODAY,
      addDays(TODAY, 5),
      null,
    ].entries()) {
      const created = await call<EnquiryDetailView>(createEnquiry, {
        body: form({
          centreId,
          childName: `Branch child ${String(index)}`,
          parentPhone: `98000000${String(10 + index)}`,
          nextFollowUpOn,
        }),
      });
      ids.push(created.body.id);
    }
    await call(markLost, { id: ids[3] ?? "", body: { reason: "Moved away" } });

    const due = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, view: "due" },
    });
    expect(ListPreschoolEnquiriesResponseModel.parse(due.body)).toBeTruthy();
    expect(due.body.total).toBe(2);
    expect(due.body.items.every((item) => item.followUpDue)).toBe(true);

    const open = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, view: "open" },
    });
    expect(open.body.total).toBe(3);
    const closed = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, view: "closed" },
    });
    expect(closed.body.items.map((item) => item.id)).toEqual([ids[3]]);
    const byStatus = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, status: "lost" },
    });
    expect(byStatus.body.total).toBe(1);
    const searched = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, q: "child 2" },
    });
    expect(searched.body.items.map((item) => item.id)).toEqual([ids[2]]);

    const first = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, limit: "3" },
    });
    expect(first.body.total).toBe(4);
    expect(first.body.items.map((item) => item.id)).toEqual(
      [...ids].reverse().slice(0, 3),
    );
    const second = await call<EnquiryPageView>(listEnquiries, {
      query: { centreId, limit: "3", cursor: first.body.nextCursor ?? "" },
    });
    expect(second.body.items.map((item) => item.id)).toEqual([ids[0]]);
    expect(second.body.nextCursor).toBeNull();

    const bad = await call(listEnquiries, {
      query: { centreId, cursor: "nope" },
    });
    expect(bad.body.code).toBe("INVALID_CURSOR");

    const counts = await call<EnquirySummaryView>(summary, {
      query: { centreId },
    });
    expect(
      PreschoolEnquirySummaryResponseModel.parse(counts.body),
    ).toBeTruthy();
    expect(counts.body).toMatchObject({
      open: 3,
      followUpsDue: 2,
      byStatus: { new: 3, lost: 1, admitted: 0 },
    });
  });

  it("finds open Enquiries and Children with the same parent phone", async () => {
    const enquiry = await create({ parentPhone: "98400 12345" });
    signInAsOwner(preschool);
    const result = await call<EnquiryPhoneMatchesView>(phoneMatches, {
      query: { centreId: preschool.centreId, phone: "+919840012345" },
    });
    expect(
      PreschoolEnquiryPhoneMatchesResponseModel.parse(result.body),
    ).toBeTruthy();
    expect(result.body.enquiries.map((item) => item.id)).toContain(enquiry.id);
    expect(result.body.children.map((child) => child.name)).toEqual(["Isha"]);

    const excluded = await call<EnquiryPhoneMatchesView>(phoneMatches, {
      query: {
        centreId: preschool.centreId,
        phone: "9840012345",
        excludeEnquiryId: enquiry.id,
      },
    });
    expect(excluded.body.enquiries.map((item) => item.id)).not.toContain(
      enquiry.id,
    );
    const partial = await call<EnquiryPhoneMatchesView>(phoneMatches, {
      query: { centreId: preschool.centreId, phone: "98400" },
    });
    expect(partial.body).toEqual({ enquiries: [], children: [] });
  });
});
