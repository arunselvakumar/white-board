import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { seededAccounts } from "@/test/finance";
import { addSupplier } from "@/test/procurement";

import { GET as access } from "./access/route";
import { GET as accountOptions } from "./accounts/options/route";
import { GET as counterparties } from "./counterparties/options/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/finance";

type Named = { items: { id: string; name: string }[] };

async function onProject(memberId: string, projectId: string): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.create({
    data: { memberId, projectId },
  });
}

describe("finance lookups: access, accounts and parties (CM-701)", () => {
  it("answers 401 before it reads the query", async () => {
    actAs({ userId: null, workspaceId: null });
    for (const response of [
      await access(new Request(`${BASE}/access?projectId=not-a-uuid`)),
      await accountOptions(new Request(`${BASE}/accounts/options?mode=x`)),
      await counterparties(new Request(`${BASE}/counterparties/options`)),
    ])
      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("refuses an unknown mode and lists only the caller's Company", async () => {
    const one = await newCompany();
    const other = await newCompany();
    const theirs = await seededAccounts(other.workspaceId);
    actAs({ userId: one.ownerId, workspaceId: one.workspaceId });

    const bad = await accountOptions(
      new Request(`${BASE}/accounts/options?mode=barter`),
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);

    const ok = await accountOptions(new Request(`${BASE}/accounts/options`));
    const ids = ((await ok.json()) as Named).items.map((item) => item.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(theirs.cashId);
    expect(ids).not.toContain(theirs.bankId);
  });

  it("returns the finance flags a member holds on a Project", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    const member = await addMember(company.workspaceId, company.ownerId, {
      "finance.transactions": ["read", "create"],
    });
    await onProject(member.memberId, projectId);
    actAs({
      userId: member.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });

    const response = await access(
      new Request(`${BASE}/access?projectId=${projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = (await response.json()) as {
      menus: Record<string, string[]>;
    };
    expect(body.menus["finance.transactions"]).toEqual(["create", "read"]);
    expect(body.menus["finance.petty_cash"]).toEqual([]);
  });

  it("lists a Project's parties only to members on that Project", async () => {
    const company = await newCompany();
    const tower = await addProject(company.workspaceId, company.ownerId);
    const villa = await addProject(company.workspaceId, company.ownerId);
    await addSupplier(company.workspaceId, company.ownerId, {
      name: "Chennai Cements",
      projectIds: [tower],
    });
    const member = await addMember(company.workspaceId, company.ownerId, {
      "finance.transactions": ["read", "create"],
    });
    await onProject(member.memberId, tower);
    actAs({
      userId: member.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });

    const own = await counterparties(
      new Request(
        `${BASE}/counterparties/options?kind=supplier&projectId=${tower}`,
      ),
    );
    expect(own.status).toBe(StatusCodes.OK);
    expect(
      ((await own.json()) as Named).items.map((item) => item.name),
    ).toEqual(["Chennai Cements"]);

    const elsewhere = await counterparties(
      new Request(
        `${BASE}/counterparties/options?kind=supplier&projectId=${villa}`,
      ),
    );
    expect(elsewhere.status).toBe(StatusCodes.FORBIDDEN);
  });
});
