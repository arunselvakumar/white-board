import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { createFollowUpRemindersHandler } from "@/src/composition/marketing-follow-up-reminders";
import { FOLLOW_UP_REMINDERS_JOB } from "@/src/marketing/application/follow-up-reminders";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import { newId } from "@/src/shared-kernel/ids";
import type { QueueJob } from "@/src/shared-kernel/queue";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getCompany } from "../companies/[id]/route";
import {
  GET as listCompanies,
  POST as createCompany,
} from "../companies/route";
import { POST as createVisit } from "../visits/route";
import { POST as cancel } from "./[id]/cancel/route";
import { POST as done } from "./[id]/done/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing/follow-ups`;
const COMPANIES = `${TEST_ORIGIN}/api/construction/marketing/companies`;
const VISITS = `${TEST_ORIGIN}/api/construction/marketing/visits`;

type Session = { cookie: string };

type FollowUp = {
  id: string;
  dueDate: string;
  due: string | null;
  status: string;
  owner: { id: string };
  visit: { id: string; number: string } | null;
  updatedAt: string;
  actions: Record<string, boolean>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update", "notification"],
  "marketing.companies": ["create", "read", "update"],
};

async function aCompany(who: Session): Promise<string> {
  const response = await createCompany(
    jsonRequest(COMPANIES, who.cookie, {
      name: `Kaveri Steel ${randomUUID().slice(0, 6)}`,
      primaryContact: { name: "Lakshmi" },
    }),
  );
  return (await json<{ id: string }>(response)).id;
}

async function add(
  who: Session,
  body: Record<string, unknown>,
  status = StatusCodes.CREATED,
): Promise<FollowUp> {
  const response = await create(
    jsonRequest(BASE, who.cookie, { type: "call", ...body }),
  );
  expect(response.status).toBe(status);
  return json<FollowUp>(response);
}

async function ids(who: Session, query = ""): Promise<string[]> {
  const response = await list(jsonRequest(`${BASE}${query}`, who.cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: { id: string }[] }>(response)).items.map(
    (item) => item.id,
  );
}

async function runReminders(): Promise<void> {
  const job: QueueJob = {
    id: newId(),
    type: FOLLOW_UP_REMINDERS_JOB,
    workspaceId: null,
    payload: null,
    attempts: 1,
    maxAttempts: 3,
  };
  await createFollowUpRemindersHandler().run(job, new AbortController().signal);
}

describe("Follow-ups (ADR CM-0040 §5, §8)", () => {
  it("adds one owned by its creator and groups open ones Overdue, Today and Upcoming", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);

    const late = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, -2),
    });
    const now = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    const later = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, 3),
      type: "send_quotation",
    });
    expect(late).toMatchObject({
      owner: { id: ravi.memberId },
      due: "overdue",
      status: "open",
    });
    expect([now.due, later.due]).toEqual(["today", "upcoming"]);
    expect(await ids(ravi, "?mine=1&status=open")).toEqual([
      late.id,
      now.id,
      later.id,
    ]);

    // The company shows its next one and lists them in its History.
    const companies = await json<{
      items: { id: string; nextFollowUpOn: string | null }[];
    }>(await listCompanies(jsonRequest(COMPANIES, ravi.cookie)));
    expect(
      companies.items.find((item) => item.id === companyId)?.nextFollowUpOn,
    ).toBe(addDays(today, -2));
    const company = await json<{ timeline: { kind: string }[] }>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${companyId}`, ravi.cookie),
        params(companyId),
      ),
    );
    expect(
      company.timeline.filter((item) => item.kind === "follow_up"),
    ).toHaveLength(3);
  });

  it("lets a member give one to a colleague: both see it, no one else does", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const anil = await memberWith(owner, MARKETING);
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);
    const given = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
      ownerMemberId: priya.memberId,
    });

    expect(await ids(ravi)).toEqual([given.id]);
    expect(await ids(ravi, "?mine=1")).toEqual([]);
    expect(await ids(priya, "?mine=1")).toEqual([given.id]);
    expect(await ids(anil)).toEqual([]);
    const hidden = await getOne(
      jsonRequest(`${BASE}/${given.id}`, anil.cookie),
      params(given.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(hidden)).toMatchObject({ code: "FOLLOW_UP_NOT_FOUND" });

    const notAPerson = await memberWith(owner, {
      "marketing.follow_ups": ["read"],
    });
    const refused = await create(
      jsonRequest(BASE, ravi.cookie, {
        type: "call",
        prospectCompanyId: companyId,
        dueDate: today,
        ownerMemberId: notAPerson.memberId,
      }),
    );
    expect(await json(refused)).toMatchObject({
      code: "MARKETING_PERSON_NOT_FOUND",
      details: { field: "ownerMemberId" },
    });
  });

  it("marks one Done with its result, never on a day to come, and then it is final", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const today = await companyToday(prisma, owner.workspaceId);
    let followUp = await add(owner, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    const mark = (body: Record<string, unknown>) =>
      done(
        jsonRequest(`${BASE}/${followUp.id}/done`, owner.cookie, {
          expectedUpdatedAt: followUp.updatedAt,
          ...body,
        }),
        params(followUp.id),
      );

    const ahead = await mark({ doneOn: addDays(today, 1) });
    expect(await json(ahead)).toMatchObject({
      code: "FOLLOW_UP_DONE_IN_FUTURE",
    });
    followUp = await json<FollowUp>(
      await mark({ resultNote: "Sent the PEB rates" }),
    );
    expect(followUp).toMatchObject({
      status: "done",
      due: null,
      actions: { canUpdate: false, canClose: false },
    });
    const again = await cancel(
      jsonRequest(`${BASE}/${followUp.id}/cancel`, owner.cookie, {
        expectedUpdatedAt: followUp.updatedAt,
      }),
      params(followUp.id),
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json(again)).toMatchObject({ code: "FOLLOW_UP_NOT_OPEN" });
    expect(await ids(owner, "?status=done")).toEqual([followUp.id]);
    expect(await ids(owner, "?status=open")).toEqual([]);
  });

  it("is made by a Visit's Next Follow-up in the same save", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const today = await companyToday(prisma, owner.workspaceId);
    const company = await json<{ contacts: { id: string }[] }>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${companyId}`, owner.cookie),
        params(companyId),
      ),
    );
    const visit = await json<{ id: string; number: string }>(
      await createVisit(
        jsonRequest(VISITS, owner.cookie, {
          status: "completed",
          prospectCompanyId: companyId,
          visitAt: new Date(Date.now() - 3_600_000).toISOString(),
          contactIds: company.contacts.map((contact) => contact.id),
          discussion: "Wants rates for a 40 m shed.",
          nextFollowUp: {
            type: "send_quotation",
            dueDate: addDays(today, 2),
            note: "Rates for 40 m",
          },
        }),
      ),
    );
    const found = await json<{ items: FollowUp[] }>(
      await list(jsonRequest(`${BASE}?visitId=${visit.id}`, owner.cookie)),
    );
    expect(found.items).toHaveLength(1);
    expect(found.items[0]).toMatchObject({
      dueDate: addDays(today, 2),
      visit: { id: visit.id, number: visit.number },
    });
  });

  it("tells the owner once on the due day and once when overdue, and a new date starts again", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const quiet = await memberWith(owner, {
      ...MARKETING,
      "marketing.follow_ups": ["create", "read", "update"],
    });
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);
    const dueToday = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
      note: "Ask about the drawings",
    });
    const overdue = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, -3),
    });
    await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, 2),
    });
    // Owned by someone without Notification: nothing is sent to them.
    await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
      ownerMemberId: quiet.memberId,
    });

    await runReminders();
    await runReminders();
    const sent = await prisma.constructionMessagingNotification.findMany({
      where: {
        workspaceId: owner.workspaceId,
        type: { startsWith: "marketing.follow_up" },
      },
      orderBy: { type: "asc" },
    });
    expect(
      sent.map((row) => [row.type, row.recipientUserId, row.title]),
    ).toEqual([
      ["marketing.follow_up_due", ravi.userId, "Follow-up due today"],
      ["marketing.follow_up_overdue", ravi.userId, "Follow-up overdue"],
    ]);
    expect(sent[0]?.body).toContain("Ask about the drawings");

    // A new due date clears the marks, so the new day is told again.
    const moved = await update(
      jsonRequest(`${BASE}/${overdue.id}/update`, ravi.cookie, {
        type: "call",
        dueDate: today,
        expectedUpdatedAt: overdue.updatedAt,
      }),
      params(overdue.id),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    const row = await prisma.constructionMarketingFollowUp.findUniqueOrThrow({
      where: { id: overdue.id },
    });
    expect(row.overdueNotifiedAt).toBeNull();
    // Sending a reminder does not make an open form stale.
    const read = await json<FollowUp>(
      await getOne(
        jsonRequest(`${BASE}/${dueToday.id}`, ravi.cookie),
        params(dueToday.id),
      ),
    );
    expect(read.updatedAt).toBe(dueToday.updatedAt);
    await runReminders();
    await expect(
      prisma.constructionMessagingNotification.count({
        where: {
          workspaceId: owner.workspaceId,
          type: "marketing.follow_up_due",
        },
      }),
    ).resolves.toBe(2);
  });

  it("needs the Follow-ups menu", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const reader = await memberWith(owner, {
      "marketing.follow_ups": ["read"],
    });
    const refused = await create(
      jsonRequest(BASE, reader.cookie, {
        type: "call",
        prospectCompanyId: companyId,
        dueDate: "2026-12-01",
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});
