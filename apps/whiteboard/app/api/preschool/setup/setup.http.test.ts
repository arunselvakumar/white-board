import { randomUUID } from "node:crypto";

import { getAuth } from "@repo/auth/server";
import { authStateFor, seedWorkspaceMember } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, describe, expect, it, vi } from "vitest";

import { removePreschool, type PreschoolFixture } from "../_lib/testing";
import { POST } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const created: string[] = [];

afterAll(async () => {
  for (const workspaceId of created)
    await removePreschool({ workspaceId } as PreschoolFixture);
});

async function workspace(institutionType: string, name = "Tiny Toes") {
  const workspaceId = `org_${randomUUID()}`;
  const ownerUserId = `user_${randomUUID()}`;
  await seedWorkspaceMember({
    workspaceId,
    userId: ownerUserId,
    role: "owner",
    workspaceName: name,
    institutionType,
  });
  created.push(workspaceId);
  return { workspaceId, ownerUserId };
}

function setUp(body?: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/preschool/setup", {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

describe("POST /api/preschool/setup", () => {
  it("answers 401 without a Session", async () => {
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: null, workspaceId: null }),
    );
    expect((await setUp()).status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("sets up a Preschool Workspace once, then returns the same setup", async () => {
    const { workspaceId, ownerUserId } = await workspace("preschool");
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: ownerUserId, workspaceId, role: "owner" }),
    );

    const first = await setUp({ academicYearStartMonth: 6 });
    expect(first.status).toBe(StatusCodes.CREATED);
    const body = (await first.json()) as {
      centreId: string;
      academicYearId: string;
      created: boolean;
    };
    expect(body.created).toBe(true);
    const centre = await prisma.preschoolCentre.findUniqueOrThrow({
      where: { id: body.centreId },
    });
    expect(centre).toMatchObject({ workspaceId, name: "Tiny Toes" });
    const settings = await prisma.preschoolSettings.findUniqueOrThrow({
      where: { workspaceId },
    });
    expect(settings.academicYearStartMonth).toBe(6);

    const again = await setUp();
    expect(again.status).toBe(StatusCodes.OK);
    expect(await again.json()).toEqual({ ...body, created: false });
  });

  it("answers 403 NOT_A_PRESCHOOL for a Training Institute", async () => {
    const { workspaceId, ownerUserId } = await workspace("training_institute");
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: ownerUserId, workspaceId, role: "owner" }),
    );
    const response = await setUp();
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(((await response.json()) as { code: string }).code).toBe(
      "NOT_A_PRESCHOOL",
    );
    expect(
      await prisma.preschoolSettings.count({ where: { workspaceId } }),
    ).toBe(0);
  });

  it("answers 403 for a member who is not the Owner", async () => {
    const { workspaceId } = await workspace("preschool");
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({
        userId: `user_${randomUUID()}`,
        workspaceId,
        role: "teacher",
      }),
    );
    expect((await setUp()).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      await prisma.preschoolSettings.count({ where: { workspaceId } }),
    ).toBe(0);
  });

  it("answers 400 for a month outside 1–12", async () => {
    const { workspaceId, ownerUserId } = await workspace("preschool");
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: ownerUserId, workspaceId, role: "owner" }),
    );
    expect((await setUp({ academicYearStartMonth: 13 })).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });
});
