import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as dropStudent } from "@/app/api/students/[id]/drop/route";
import { POST as createStudent } from "@/app/api/students/route";

import { GET as getDashboard } from "./route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);

function session(userId: string | null, orgId: string | null) {
  mockedAuth.mockResolvedValue({ userId, orgId } as never);
}

type DashboardJson = {
  activeStudentCount: number;
  outstandingDuesPaise: number;
  todayBatches: unknown[];
  recentStudents: { name: string }[];
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("owner dashboard HTTP API", () => {
  const userId = "user_http";
  let orgId: string;

  beforeEach(() => {
    orgId = `org_${randomUUID()}`;
    session(userId, orgId);
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await getDashboard();
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("shows recent Students and zero dues on an empty register", async () => {
    await createStudent(
      new Request("http://localhost/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anita Sharma",
          phone: "9876543210",
        }),
      }),
    );
    const response = await getDashboard();
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<DashboardJson>(response);
    expect(body.activeStudentCount).toBe(1);
    expect(body.outstandingDuesPaise).toBe(0);
    expect(body.recentStudents[0]?.name).toBe("Anita Sharma");
  });

  it("omits Dropped Students from the recent list", async () => {
    const created = await json<{ id: string }>(
      await createStudent(
        new Request("http://localhost/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Ravi Kumar",
            phone: "9000000001",
          }),
        }),
      ),
    );
    await dropStudent(
      new Request(`http://localhost/api/students/${created.id}/drop`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    const body = await json<DashboardJson>(await getDashboard());
    expect(body.activeStudentCount).toBe(0);
    expect(body.recentStudents).toEqual([]);
  });
});
