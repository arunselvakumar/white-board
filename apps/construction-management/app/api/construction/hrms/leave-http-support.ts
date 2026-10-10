import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import { jsonRequest } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

/**
 * Helpers for the leave HTTP tests (CM-310 … CM-313): call a route handler
 * as a signed-in Team Member, read JSON, and set the Company's HRMS
 * Settings straight in the table.
 */

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

type PlainHandler = (request: Request) => Promise<Response>;

export const HRMS_API = `${TEST_ORIGIN}/api/construction/hrms`;

export function get(
  handler: PlainHandler,
  path: string,
  cookie: string,
): Promise<Response> {
  return handler(jsonRequest(`${HRMS_API}${path}`, cookie));
}

export function post(
  handler: PlainHandler,
  path: string,
  cookie: string,
  body: unknown = {},
): Promise<Response> {
  return handler(jsonRequest(`${HRMS_API}${path}`, cookie, body));
}

export function getItem(
  handler: Handler,
  path: string,
  id: string,
  cookie: string,
): Promise<Response> {
  return handler(jsonRequest(`${HRMS_API}${path}`, cookie), {
    params: Promise.resolve({ id }),
  });
}

export function postItem(
  handler: Handler,
  path: string,
  id: string,
  cookie: string,
  body: unknown = {},
): Promise<Response> {
  return handler(jsonRequest(`${HRMS_API}${path}`, cookie, body), {
    params: Promise.resolve({ id }),
  });
}

export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** The Owner's Team Member id. */
export async function ownerMemberId(
  workspaceId: string,
  userId: string,
): Promise<string> {
  const member =
    await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
      where: { workspaceId, userId },
      select: { id: true },
    });
  return member.id;
}

/** Writes the Company's HRMS Settings row (defaults plus `overrides`). */
export async function setHrmsSettings(
  workspaceId: string,
  overrides: Partial<{
    leaveApprovalLevels: number;
    leaveYear: "calendar" | "financial";
    carryForwardEnabled: boolean;
    carryForwardMaxDays: string | null;
    leaveAccrualEnabled: boolean;
    workingDays: number[];
  }>,
): Promise<void> {
  const now = new Date();
  const data = {
    workingDays: [1, 2, 3, 4, 5],
    ...overrides,
  };
  await prisma.constructionHrmsSettings.upsert({
    where: { workspaceId },
    create: {
      id: randomUUID(),
      workspaceId,
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: "test",
      updatedBy: "test",
    },
    update: { ...data, updatedAt: now },
  });
}

/** A leave type id of the Company by name (a seed). */
export async function leaveTypeId(
  workspaceId: string,
  name: string,
): Promise<string> {
  const row = await prisma.constructionHrmsLeaveType.findFirstOrThrow({
    where: { workspaceId, name, deletedAt: null },
    select: { id: true },
  });
  return row.id;
}
