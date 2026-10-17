import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { GET as listInquiries } from "@/app/api/construction/sales/inquiries/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, newCompany } from "@/test/companies";
import {
  salesFollowUpRow,
  salesInquiryFull,
  salesLists,
  salesProject,
} from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { GET as dashboard } from "./inquiry/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/dashboard/inquiry";
const INQUIRIES = "http://localhost/api/construction/sales/inquiries";
const TODAY = todayIn("Asia/Kolkata");
const DAY = 86_400_000;

type Section = {
  total: number;
  converted: number;
  lost: number;
  conversionRate: number | null;
  open: number;
  overdue: number;
  funnel: { stageId: string; name: string; count: number }[];
  leadSources: {
    name: string;
    total: number;
    converted: number;
    rate: number | null;
  }[];
  team: {
    memberId: string | null;
    inquiries: number;
    followUps: number;
    conversions: number;
  }[];
  callActivity: { period: string; calls: number; all: number };
};

async function read(projectId: string, query = ""): Promise<Section | null> {
  const response = await dashboard(
    new Request(
      `${BASE}?projectId=${projectId}&from=${addDays(TODAY, -30)}&to=${TODAY}${query}`,
    ),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return ((await response.json()) as { inquiry: Section | null }).inquiry;
}

async function total(projectId: string, query = ""): Promise<number> {
  const page = (await (
    await listInquiries(
      new Request(`${INQUIRIES}?projectId=${projectId}${query}`),
    )
  ).json()) as { total: number };
  return page.total;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const projectId = await salesProject(ws, by);
  const lists = await salesLists(projectId);
  const seller = await addMember(ws, by, {
    "sales.inquiries": ["read"],
    "reporting.project_dashboard": ["read"],
  });
  await sharedAssign(seller.memberId, projectId);
  const add = (fields: Parameters<typeof salesInquiryFull>[3]) =>
    salesInquiryFull(ws, projectId, by, fields);
  const asha = await add({
    name: "Asha",
    leadSourceId: lists.sourceId["Walk-in"],
    funnelStageId: lists.stageId["New"],
    assigneeMemberId: seller.memberId,
    nextFollowUpAt: new Date(Date.now() - 2 * DAY),
    nextFollowUpHasTime: true,
  });
  await add({
    name: "Bala",
    leadSourceId: lists.sourceId["Walk-in"],
    funnelStageId: lists.stageId["Site Visit"],
    status: "converted",
    assigneeMemberId: seller.memberId,
  });
  await add({
    name: "Chitra",
    leadSourceId: lists.sourceId["Referral"],
    funnelStageId: lists.stageId["Contacted"],
    status: "lost",
  });
  await add({
    name: "Dev",
    funnelStageId: lists.stageId["New"],
    nextFollowUpAt: new Date(Date.now() + 5 * DAY),
    nextFollowUpHasTime: true,
  });
  // Old: outside the duration, but still Open.
  await add({
    name: "Old",
    inquiryDate: addDays(TODAY, -90),
    funnelStageId: lists.stageId["Negotiation"],
  });
  await salesFollowUpRow(ws, projectId, asha, by, {
    activity: "call",
    memberId: seller.memberId,
  });
  await salesFollowUpRow(ws, projectId, asha, by, {
    activity: "site_visit",
    memberId: seller.memberId,
  });
  await salesFollowUpRow(ws, projectId, asha, by, {
    activity: "call",
    doneAt: new Date(Date.now() - 60 * DAY),
    memberId: seller.memberId,
  });
  actAs({ userId: by, workspaceId: ws });
  return { ws, by, projectId, lists, seller };
}

describe("Inquiry dashboard section (CM-1008, CM-0022 §11)", () => {
  it("counts like the list: totals by Inquiry Date, Open and Overdue now, the funnel per stage", async () => {
    const ctx = await setup();
    const section = await read(ctx.projectId);
    expect(section).toMatchObject({
      total: 4,
      converted: 1,
      lost: 1,
      conversionRate: 25,
    });
    expect(section?.open).toBe(await total(ctx.projectId, "&status=open"));
    expect(section?.overdue).toBe(await total(ctx.projectId, "&due=overdue"));
    expect(section?.overdue).toBe(1);
    expect(section?.funnel.map((stage) => stage.name)).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
    for (const stage of section?.funnel ?? [])
      expect(stage.count).toBe(
        await total(
          ctx.projectId,
          `&status=open&funnelStageId=${stage.stageId}`,
        ),
      );
    expect(section?.leadSources[0]).toMatchObject({
      name: "Walk-in",
      total: 2,
      converted: 1,
      rate: 50,
    });
    expect(
      section?.team.find((member) => member.memberId === ctx.seller.memberId),
    ).toEqual({
      memberId: ctx.seller.memberId,
      name: "Prabhu Saravanan",
      inquiries: 2,
      followUps: 2,
      conversions: 1,
    });
    expect(section?.callActivity).toMatchObject({
      period: "today",
      calls: 1,
      all: 2,
    });
    const allTime = await read(ctx.projectId, "&period=all_time");
    expect(allTime?.callActivity).toMatchObject({ calls: 2, all: 3 });
  });

  it("scopes by View all like the list; null without Inquiry Read; Dashboard Read needed", async () => {
    const ctx = await setup();
    actAs({ userId: ctx.seller.userId, workspaceId: ctx.ws, role: "member" });
    const own = await read(ctx.projectId);
    expect(own?.total).toBe(2);
    expect(own?.open).toBe(await total(ctx.projectId, "&status=open"));
    expect(own?.open).toBe(1);
    const viewer = await addMember(ctx.ws, ctx.by, {
      "reporting.project_dashboard": ["read"],
    });
    await sharedAssign(viewer.memberId, ctx.projectId);
    actAs({ userId: viewer.userId, workspaceId: ctx.ws, role: "member" });
    expect(await read(ctx.projectId)).toBeNull();
    const outsider = await addMember(ctx.ws, ctx.by, {
      "sales.inquiries": ["read"],
    });
    await sharedAssign(outsider.memberId, ctx.projectId);
    actAs({ userId: outsider.userId, workspaceId: ctx.ws, role: "member" });
    expect(
      (
        await dashboard(
          new Request(
            `${BASE}?projectId=${ctx.projectId}&from=${TODAY}&to=${TODAY}`,
          ),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty(
      "/api/construction/sales/dashboard/inquiry",
    );
  });
});
