import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import { partyLedger } from "@/src/finance/infrastructure/party-ledger";
import type { Flag } from "@/src/shared-kernel/access";
import { calendarDateToDb, todayIn } from "@/src/shared-kernel/calendar-date";

import { actAs, addMember, addProject, newCompany } from "./companies";
import { seededAccounts } from "./finance";
import { addContractor, addSupplier } from "./procurement";

/**
 * Party money test helpers (CM-705, CM-706, CM-708): a Company with a
 * Project, a Contractor (with PAN), a Supplier and an Other Party on it,
 * and requests to the finance routes with mocked sessions (the test file
 * mocks `getCompanyAuthFromHeaders`).
 */

export const FINANCE_BASE = "http://localhost/api/construction/finance";
export const TODAY = todayIn("Asia/Kolkata");

export function postTo(path: string, body: unknown): Request {
  return new Request(`${FINANCE_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getFrom(
  path: string,
  query: Record<string, string | undefined> = {},
): Request {
  const params = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  );
  const search = params.toString();
  return new Request(
    `${FINANCE_BASE}${path}${search === "" ? "" : `?${search}`}`,
  );
}

export const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

export async function addOtherParty(
  workspaceId: string,
  by: string,
  projectIds: readonly string[] = [],
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionFinanceOtherParty.create({
    data: {
      id,
      workspaceId,
      name: `Kumaran Consultants ${id.slice(0, 6)}`,
      createdBy: by,
      updatedBy: by,
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
    },
  });
  return id;
}

/** Sets a Contractor's PAN and TDS settings. */
export async function contractorTds(
  id: string,
  settings: {
    pan?: string | null;
    tdsApplicable?: boolean;
    tdsLowerRate?: string | null;
  },
): Promise<void> {
  await prisma.constructionMastersContractor.update({
    where: { id },
    data: {
      ...(settings.pan === undefined ? {} : { pan: settings.pan }),
      ...(settings.tdsApplicable === undefined
        ? {}
        : { tdsApplicable: settings.tdsApplicable }),
      ...(settings.tdsLowerRate === undefined
        ? {}
        : { tdsLowerRate: settings.tdsLowerRate }),
    },
  });
}

/** The Company's Financial Closing Date (CM-113). */
export async function closeBooks(
  workspaceId: string,
  by: string,
  date: string,
): Promise<void> {
  await prisma.constructionOrganizationBackdatedEntryPolicy.upsert({
    where: { workspaceId },
    create: {
      id: randomUUID(),
      workspaceId,
      createDays: 0,
      createOverrideDesignationIds: [],
      editDays: 0,
      editOverrideDesignationIds: [],
      financialClosingDate: calendarDateToDb(date),
      modules: {},
      createdBy: by,
      updatedBy: by,
    },
    update: { financialClosingDate: calendarDateToDb(date) },
  });
}

/** A party's balance on a Project, from the party ledger. */
export async function partyBalance(
  workspaceId: string,
  partyType: "contractor" | "supplier" | "other_party",
  partyId: string,
  projectId: string,
): Promise<bigint> {
  const balances = await prisma.$transaction((tx) =>
    partyLedger.balances(tx, workspaceId, partyType, [partyId], {
      projectId,
    }),
  );
  return balances.get(partyId) ?? 0n;
}

/** A Company acting as its Owner, with one Project and a party of each type. */
export async function partyWorld() {
  const company = await newCompany();
  const { workspaceId, ownerId } = company;
  const owner = { userId: ownerId, workspaceId, role: "owner" as const };
  const projectId = await addProject(workspaceId, ownerId, "Tower A");
  const otherProjectId = await addProject(workspaceId, ownerId, "Tower B");
  const contractorId = await addContractor(workspaceId, ownerId, [
    projectId,
    otherProjectId,
  ]);
  await contractorTds(contractorId, { pan: "ABCPK1234F" });
  const supplierId = await addSupplier(workspaceId, ownerId, {
    projectIds: [projectId, otherProjectId],
  });
  const otherPartyId = await addOtherParty(workspaceId, ownerId, [projectId]);
  const accounts = await seededAccounts(workspaceId);
  actAs(owner);
  return {
    company,
    workspaceId,
    ownerId,
    owner,
    projectId,
    otherProjectId,
    contractorId,
    supplierId,
    otherPartyId,
    ...accounts,
  };
}

export type PartyWorld = Awaited<ReturnType<typeof partyWorld>>;

/** A member with `flags` on Parties, assigned to the Project unless told not. */
export async function partiesMember(
  world: PartyWorld,
  flags: Flag[],
  options: { onProject?: boolean; extra?: Record<string, Flag[]> } = {},
) {
  const added = await addMember(world.workspaceId, world.ownerId, {
    "finance.parties": flags,
    ...options.extra,
  });
  if (options.onProject !== false)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: world.projectId },
    });
  return {
    userId: added.userId,
    memberId: added.memberId,
    workspaceId: world.workspaceId,
    role: "member" as const,
  };
}
