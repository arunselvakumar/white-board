import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import {
  requireWorkspaceSession,
  verifiedEmailsOf,
} from "@/app/api/_lib/require-workspace-session";
import type {
  PreschoolActor,
  PreschoolRole,
} from "@/src/preschool/application/access";
import { PrismaAccessReader } from "@/src/preschool/infrastructure/prisma-access-reader";

const reader = new PrismaAccessReader();

const ANY_ROLE = ["owner", "centre_head", "teacher", "parent"] as const;

/**
 * The gate for every Preschool route (ADR-0055). No Session → 401; no Active
 * Workspace → 403 `NO_ACTIVE_WORKSPACE`; a Workspace that is not a Preschool
 * → 403 `NOT_A_PRESCHOOL`; a member with no Staff record or Child, or a role
 * outside `roles` → 403 `FORBIDDEN`. The Centres, Classrooms and Children the
 * User may open are read on every request.
 */
export async function requirePreschoolActor(
  roles: readonly PreschoolRole[] = ANY_ROLE,
): Promise<PreschoolActor | Response> {
  const session = await requireWorkspaceSession(
    ["owner", "teacher", "student", "parent"],
    "You do not have access to this.",
  );
  if (session instanceof Response) return session;
  const result = await reader.resolve({
    workspaceId: session.workspaceId,
    userId: session.userId,
    userName: session.user.name,
    memberRole: session.role,
    verifiedEmails: verifiedEmailsOf(session.user),
  });
  if (result.kind === "not_a_preschool")
    return jsonError(
      StatusCodes.FORBIDDEN,
      "NOT_A_PRESCHOOL",
      "This Workspace is not a Preschool.",
    );
  if (result.kind === "no_access" || !roles.includes(result.actor.role))
    return jsonError(
      StatusCodes.FORBIDDEN,
      "FORBIDDEN",
      "You do not have access to this.",
    );
  return result.actor;
}

/** Owner only: Head Office screens and Workspace-wide masters. */
export function requirePreschoolOwner(): Promise<PreschoolActor | Response> {
  return requirePreschoolActor(["owner"]);
}

/** Owner or Centre Head. Handlers still check the Centre with `assertCentre`. */
export function requirePreschoolManager(): Promise<PreschoolActor | Response> {
  return requirePreschoolActor(["owner", "centre_head"]);
}

/** Owner, Centre Head or Teacher. */
export function requirePreschoolStaff(): Promise<PreschoolActor | Response> {
  return requirePreschoolActor(["owner", "centre_head", "teacher"]);
}

export type IdContext = { params: Promise<{ id: string }> };
