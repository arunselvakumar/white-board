import type { Prisma, PrismaClient } from "@repo/construction-db";

import {
  BACKDATED_MODULES,
  DEFAULT_BACKDATED_POLICY,
  createBackdatedPolicy,
  type BackdatedActor,
  type BackdatedLimitInput,
  type BackdatedPolicy,
  type BackdatedPolicyInput,
} from "./backdated-policy";
import { calendarDateFromDb } from "./calendar-date";

type PolicyRow =
  Prisma.ConstructionOrganizationBackdatedEntryPolicyGetPayload<object>;

function limitFromJson(value: unknown): BackdatedLimitInput | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const ids = record["overrideDesignationIds"];
  return {
    days: typeof record["days"] === "number" ? record["days"] : 0,
    overrideDesignationIds: Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/** A stored policy row as the kernel value. Unknown module keys are dropped. */
export function backdatedPolicyFromRow(row: PolicyRow): BackdatedPolicy {
  const stored =
    row.modules != null &&
    typeof row.modules === "object" &&
    !Array.isArray(row.modules)
      ? (row.modules as Record<string, unknown>)
      : {};
  const modules: NonNullable<BackdatedPolicyInput["modules"]>[number][] = [];
  for (const { key } of BACKDATED_MODULES) {
    const value = stored[key];
    if (value == null || typeof value !== "object") continue;
    const setting = value as Record<string, unknown>;
    modules.push({
      key,
      mode: setting["mode"] === "custom" ? "custom" : "global",
      create: limitFromJson(setting["create"]),
      edit: limitFromJson(setting["edit"]),
    });
  }
  return createBackdatedPolicy({
    create: {
      days: row.createDays,
      overrideDesignationIds: row.createOverrideDesignationIds,
    },
    edit: {
      days: row.editDays,
      overrideDesignationIds: row.editOverrideDesignationIds,
    },
    financialClosingDate:
      row.financialClosingDate == null
        ? null
        : calendarDateFromDb(row.financialClosingDate),
    modules,
  });
}

/**
 * The Active Company's policy for a create or edit command in any context.
 * Reads the organization context's table directly, as the access reader
 * does: the policy is part of the kernel's contract (ADR CM-0001).
 */
export async function loadBackdatedPolicy(
  db: Pick<PrismaClient, "constructionOrganizationBackdatedEntryPolicy">,
  workspaceId: string,
): Promise<BackdatedPolicy> {
  const row = await db.constructionOrganizationBackdatedEntryPolicy.findUnique({
    where: { workspaceId },
  });
  return row == null ? DEFAULT_BACKDATED_POLICY : backdatedPolicyFromRow(row);
}

/** Who is entering, for `assertCanCreate`/`assertCanEdit`. */
export async function loadBackdatedActor(
  db: Pick<PrismaClient, "constructionOrganizationTeamMember">,
  session: { workspaceId: string; userId: string; role: "owner" | "member" },
): Promise<BackdatedActor> {
  if (session.role === "owner") return { designationId: null, isOwner: true };
  const member = await db.constructionOrganizationTeamMember.findFirst({
    where: {
      workspaceId: session.workspaceId,
      userId: session.userId,
      status: "active",
      deletedAt: null,
    },
    select: { designationId: true },
  });
  return { designationId: member?.designationId ?? null, isOwner: false };
}
