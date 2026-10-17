import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { GET as chart } from "@/app/api/construction/sales/units/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, newCompany } from "@/test/companies";
import { salesBookingRow, salesProject, salesWing } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { GET as dashboard } from "./booking/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/dashboard/booking";
const TODAY = todayIn("Asia/Kolkata");

type Counts = Record<string, number>;
type Dashboard = {
  booking: {
    counts: Counts;
    wings: { id: string; name: string; counts: Counts }[];
    latest: { customerName: string; status: string; unitName: string }[];
  } | null;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("Booking dashboard section (CM-1008, CM-0022 §11)", () => {
  it("shows the Units chart's counts and the five latest bookings", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const by = company.ownerId;
    actAs({ userId: by, workspaceId: ws });
    const projectId = await salesProject(ws, by);
    const wing = await salesWing(ws, projectId, by, {
      name: "Tower A",
      floors: 3,
      perFloor: 2,
    });
    const names = ["101", "102", "201", "202", "301", "302"];
    for (const [index, name] of names.entries())
      await salesBookingRow(
        ws,
        projectId,
        wing.wingId,
        wing.units[name] ?? "",
        by,
        {
          customerName: `Buyer ${String(index + 1)}`,
          status:
            index === 1 ? "on_hold" : index === 2 ? "cancelled" : "booked",
          holdUntil: index === 1 ? addDays(TODAY, -1) : null,
        },
      );
    const response = await dashboard(
      new Request(`${BASE}?projectId=${projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<Dashboard>(response);
    const units = await json<{
      counts: Counts;
      wings: { id: string; counts: Counts }[];
    }>(
      await chart(
        new Request(
          `http://localhost/api/construction/sales/units?projectId=${projectId}`,
        ),
      ),
    );
    expect(body.booking?.counts).toEqual(units.counts);
    expect(body.booking?.counts).toMatchObject({
      total: 8,
      booked: 4,
      on_hold: 0,
      available: 4,
    });
    expect(body.booking?.wings.map((item) => item.counts)).toEqual(
      units.wings.map((item) => item.counts),
    );
    expect(body.booking?.latest.map((item) => item.customerName)).toEqual([
      "Buyer 6",
      "Buyer 5",
      "Buyer 4",
      "Buyer 3",
      "Buyer 2",
    ]);
    expect(body.booking?.latest[4]?.status).toBe("hold_expired");
  });

  it("needs Dashboard Read; without Booking Read the section is null", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const projectId = await salesProject(ws, company.ownerId);
    const viewer = await addMember(ws, company.ownerId, {
      "reporting.project_dashboard": ["read"],
    });
    await sharedAssign(viewer.memberId, projectId);
    actAs({ userId: viewer.userId, workspaceId: ws, role: "member" });
    const body = await json<Dashboard>(
      await dashboard(new Request(`${BASE}?projectId=${projectId}`)),
    );
    expect(body.booking).toBeNull();
    const outsider = await addMember(ws, company.ownerId, {
      "sales.bookings": ["read"],
    });
    await sharedAssign(outsider.memberId, projectId);
    actAs({ userId: outsider.userId, workspaceId: ws, role: "member" });
    expect(
      (await dashboard(new Request(`${BASE}?projectId=${projectId}`))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const stranger = await newCompany();
    actAs({ userId: stranger.ownerId, workspaceId: stranger.workspaceId });
    expect(
      (await dashboard(new Request(`${BASE}?projectId=${projectId}`))).status,
    ).toBe(StatusCodes.NOT_FOUND);
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(document.paths).toHaveProperty(
      "/api/construction/sales/dashboard/booking",
    );
  });
});
