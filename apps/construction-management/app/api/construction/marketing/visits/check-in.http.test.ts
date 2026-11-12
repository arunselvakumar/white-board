import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";
import { zoneInstant } from "@/src/shared-kernel/zone-time";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as createCompany } from "../companies/route";
import { POST as checkIn } from "./[id]/check-in/route";
import { POST as checkOut } from "./[id]/check-out/route";
import { GET as list, POST as createVisit } from "./route";

const VISITS = `${TEST_ORIGIN}/api/construction/marketing/visits`;
const COMPANIES = `${TEST_ORIGIN}/api/construction/marketing/companies`;

type Check = {
  byName: string;
  location: string;
  position: { latitude: number; longitude: number; accuracy: number } | null;
} | null;

type Visit = {
  id: string;
  checkIn: Check;
  checkOut: Check;
  history: { action: string }[];
  actions: { canCheckIn: boolean; canCheckOut: boolean };
};

type Session = { cookie: string; workspaceId?: string };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

const SULUR = { latitude: 11.0247, longitude: 77.1258, accuracy: 18 };

/** Noon on the Company's today, or another day: clear of midnight either way. */
async function noon(workspaceId: string, days = 0): Promise<string> {
  const [today, timeZone] = await Promise.all([
    companyToday(prisma, workspaceId),
    companyTimezone(prisma, workspaceId),
  ]);
  return zoneInstant(addDays(today, days), 12 * 60, timeZone).toISOString();
}

async function plan(
  who: Session,
  workspaceId: string,
  body: Record<string, unknown> = {},
): Promise<Visit> {
  const company = await json<{ id: string }>(
    await createCompany(
      jsonRequest(COMPANIES, who.cookie, {
        name: `Kaveri Steel ${randomUUID().slice(0, 6)}`,
      }),
    ),
  );
  const response = await createVisit(
    jsonRequest(VISITS, who.cookie, {
      status: "planned",
      prospectCompanyId: company.id,
      visitAt: await noon(workspaceId),
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Visit>(response);
}

function check(
  route: typeof checkIn,
  which: "check-in" | "check-out",
  who: Session,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return route(
    jsonRequest(`${VISITS}/${id}/${which}`, who.cookie, body),
    params(id),
  );
}

describe("Check-in and check-out (ADR CM-0040 §10)", () => {
  it("records one position at check-in and the reason when there is none at check-out", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const visit = await plan(ravi, owner.workspaceId);
    expect(visit.actions).toMatchObject({
      canCheckIn: true,
      canCheckOut: false,
    });

    const inResponse = await check(checkIn, "check-in", ravi, visit.id, {
      position: SULUR,
    });
    expect(inResponse.status).toBe(StatusCodes.OK);
    const checkedIn = await json<Visit>(inResponse);
    expect(checkedIn.checkIn).toMatchObject({
      location: "recorded",
      position: SULUR,
    });
    expect(checkedIn.actions).toMatchObject({
      canCheckIn: false,
      canCheckOut: true,
    });
    expect(checkedIn.history[0]?.action).toBe("checked_in");
    const again = await check(checkIn, "check-in", ravi, visit.id, {
      position: SULUR,
    });
    expect(await json(again)).toMatchObject({ code: "VISIT_CHECKED_IN" });

    const out = await json<Visit>(
      await check(checkOut, "check-out", ravi, visit.id, {
        location: "refused",
      }),
    );
    expect(out.checkOut).toMatchObject({ location: "refused", position: null });
    expect(out.actions.canCheckOut).toBe(false);

    // The list marks it; the position stays on the Visit and off the trail.
    const items = await json<{ items: { id: string; checkedIn: boolean }[] }>(
      await list(jsonRequest(`${VISITS}?limit=500`, ravi.cookie)),
    );
    expect(items.items.find((item) => item.id === visit.id)?.checkedIn).toBe(
      true,
    );
    // Checked in, so not Missed once its time has passed.
    await prisma.constructionMarketingVisit.update({
      where: { id: visit.id },
      data: { visitAt: new Date(Date.now() - 60_000) },
    });
    const missed = await json<{ items: { id: string }[] }>(
      await list(jsonRequest(`${VISITS}?status=missed`, ravi.cookie)),
    );
    expect(missed.items.map((item) => item.id)).not.toContain(visit.id);
    const planned = await json<{ items: { id: string; status: string }[] }>(
      await list(jsonRequest(`${VISITS}?status=planned`, ravi.cookie)),
    );
    expect(planned.items.find((item) => item.id === visit.id)?.status).toBe(
      "planned",
    );
    const trail =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: { entityId: visit.id, action: "visit.checked_in" },
      });
    expect(trail.after).toEqual({ location: "recorded" });
  });

  it("is for the Visit's own people, on its day, in order", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const visit = await plan(ravi, owner.workspaceId);

    // The Owner sees every Visit but did not go on this one.
    const notOn = await check(checkIn, "check-in", owner, visit.id, {
      location: "unavailable",
    });
    expect(notOn.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(notOn)).toMatchObject({ code: "CHECK_IN_VISITORS_ONLY" });

    const early = await check(checkOut, "check-out", ravi, visit.id, {
      location: "unavailable",
    });
    expect(await json(early)).toMatchObject({ code: "VISIT_NOT_CHECKED_IN" });
    const nowhere = await check(checkIn, "check-in", ravi, visit.id, {});
    expect(await json(nowhere)).toMatchObject({
      code: "CHECK_LOCATION_REQUIRED",
    });

    const tomorrow = await plan(ravi, owner.workspaceId, {
      visitAt: await noon(owner.workspaceId, 1),
    });
    expect(tomorrow.actions.canCheckIn).toBe(false);
    const notToday = await check(checkIn, "check-in", ravi, tomorrow.id, {
      position: SULUR,
    });
    expect(await json(notToday)).toMatchObject({ code: "CHECK_IN_NOT_TODAY" });
  });
});
