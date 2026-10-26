import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { companyAuthStateFor } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";
import type { Flag } from "@/src/shared-kernel/access";
import { assertCanCreate } from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { roleWith } from "@/test/companies";

import { GET as getPolicy } from "./route";
import { POST as updatePolicy } from "./update/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const mockedAuth = vi.mocked(getCompanyAuthFromHeaders);

const URL_BASE =
  "http://localhost/api/construction/organization/settings/backdated-entry";

const getRequest = () => new Request(URL_BASE);
const updateRequest = (body: unknown) =>
  new Request(`${URL_BASE}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function session(input: {
  userId: string | null;
  workspaceId: string | null;
  role?: "owner" | "member";
}) {
  mockedAuth.mockResolvedValue(companyAuthStateFor(input));
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

type PolicyBody = {
  create: { days: number; overrideRoleIds: string[] };
  edit: { days: number; overrideRoleIds: string[] };
  financialClosingDate: string | null;
  modules: {
    key: string;
    group: string;
    mode: string;
    create: { days: number; overrideRoleIds: string[] };
  }[];
  updatedAt: string | null;
};

async function newCompany() {
  const userId = randomUUID();
  await prisma.identityUser.create({
    data: { id: userId, name: "Owner", email: `${userId}@example.test` },
  });
  const created = await createCompanyHandlers().create.execute({
    name: "Anugraha Engineers",
    country: "IN",
    userId,
    userName: "Owner",
    userMobile: null,
    userEmail: `${userId}@example.test`,
  });
  const roles = await prisma.constructionOrganizationRole.findMany({
    where: { workspaceId: created.workspaceId },
  });
  const idOf = (name: string) =>
    roles.find((item) => item.name === name)?.id ?? "";
  return {
    workspaceId: created.workspaceId,
    ownerId: userId,
    accountantId: idOf("Accountant"),
    engineerId: idOf("Site Engineer"),
  };
}

/**
 * An active Member holding `flags` on Settings, through their Role, or on
 * the given Role.
 */
async function newMember(
  workspaceId: string,
  flags: Flag[],
  onRole?: string,
): Promise<string> {
  const userId = randomUUID();
  const memberId = randomUUID();
  const roleId =
    onRole ??
    (await roleWith(workspaceId, "test", {
      "organization.settings": flags,
    }));
  await prisma.constructionOrganizationTeamMember.create({
    data: {
      id: memberId,
      workspaceId,
      userId,
      name: "Ravi",
      roleId,
      mobile: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      status: "active",
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return userId;
}

describe("Back-dated Entry policy HTTP (CM-113)", () => {
  it("is 401 without a Session and 403 for a Member without Settings", async () => {
    session({ userId: null, workspaceId: null });
    expect((await getPolicy(getRequest())).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    session({ userId: "user-x", workspaceId: randomUUID(), role: "member" });
    const response = await getPolicy(getRequest());
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("starts a new Company with no limits and no closing date", async () => {
    const company = await newCompany();
    session({ userId: company.ownerId, workspaceId: company.workspaceId });
    const response = await getPolicy(getRequest());
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<PolicyBody>(response);
    expect(body.create).toEqual({ days: 0, overrideRoleIds: [] });
    expect(body.edit).toEqual({ days: 0, overrideRoleIds: [] });
    expect(body.financialClosingDate).toBeNull();
    expect(body.updatedAt).toBeNull();
    expect(body.modules).toHaveLength(31);
    expect(body.modules[0]).toMatchObject({
      key: "purchase_request",
      group: "procurement",
      mode: "global",
    });
  });

  it("saves the policy, audits before and after, and guards entries with it", async () => {
    const company = await newCompany();
    session({ userId: company.ownerId, workspaceId: company.workspaceId });
    const response = await updatePolicy(
      updateRequest({
        create: { days: 3, overrideRoleIds: [company.accountantId] },
        edit: { days: 1, overrideRoleIds: [] },
        financialClosingDate: "2026-03-31",
        modules: [
          {
            key: "labour_attendance",
            mode: "custom",
            create: { days: 1, overrideRoleIds: [company.engineerId] },
            edit: { days: 0, overrideRoleIds: [] },
          },
        ],
        expectedUpdatedAt: null,
      }),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const saved = await json<PolicyBody>(response);
    expect(saved.financialClosingDate).toBe("2026-03-31");
    expect(saved.updatedAt).not.toBeNull();
    expect(
      saved.modules.find((item) => item.key === "labour_attendance"),
    ).toMatchObject({ mode: "custom", create: { days: 1 } });

    const read = await json<PolicyBody>(await getPolicy(getRequest()));
    expect(read.create).toEqual({
      days: 3,
      overrideRoleIds: [company.accountantId],
    });
    expect(read.updatedAt).toBe(saved.updatedAt);

    // A save based on a stale read is refused instead of overwriting.
    const stale = await updatePolicy(
      updateRequest({
        create: { days: 0, overrideRoleIds: [] },
        edit: { days: 0, overrideRoleIds: [] },
        financialClosingDate: null,
        expectedUpdatedAt: null,
      }),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "BACKDATED_POLICY_CHANGED",
    });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: "backdated_entry_policy.updated",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toMatchObject({ create: { days: 0 } });
    expect(audit[0]?.after).toMatchObject({
      create: { days: 3 },
      financialClosingDate: "2026-03-31",
    });

    // Other contexts read the same policy through the kernel.
    const policy = await loadBackdatedPolicy(prisma, company.workspaceId);
    const memberUserId = await newMember(
      company.workspaceId,
      [],
      company.engineerId,
    );
    const actor = await loadBackdatedActor(prisma, {
      workspaceId: company.workspaceId,
      userId: memberUserId,
      role: "member",
    });
    expect(actor).toEqual({
      roleId: company.engineerId,
      isOwner: false,
    });
    expect(() => {
      assertCanCreate(
        policy,
        "purchase_order",
        "2026-10-01",
        actor,
        "2026-10-08",
      );
    }).toThrow(DomainError);
    expect(() => {
      assertCanCreate(
        policy,
        "labour_attendance",
        "2026-09-01",
        actor,
        "2026-10-08",
      );
    }).not.toThrow();
  });

  it("rejects bad days and Roles of another Company", async () => {
    const company = await newCompany();
    const other = await newCompany();
    session({ userId: company.ownerId, workspaceId: company.workspaceId });
    const badDays = await updatePolicy(
      updateRequest({
        create: { days: -1, overrideRoleIds: [] },
        edit: { days: 0, overrideRoleIds: [] },
        financialClosingDate: null,
        expectedUpdatedAt: null,
      }),
    );
    expect(badDays.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(badDays)).toMatchObject({ code: "VALIDATION_ERROR" });

    const foreign = await updatePolicy(
      updateRequest({
        create: { days: 1, overrideRoleIds: [other.accountantId] },
        edit: { days: 0, overrideRoleIds: [] },
        financialClosingDate: null,
        expectedUpdatedAt: null,
      }),
    );
    expect(foreign.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(foreign)).toMatchObject({
      code: "ROLE_NOT_FOUND",
      details: { roleIds: [other.accountantId] },
    });
  });

  it("lets a Member with Settings read but only update with the update flag", async () => {
    const company = await newCompany();
    const reader = await newMember(company.workspaceId, ["read"]);
    session({
      userId: reader,
      workspaceId: company.workspaceId,
      role: "member",
    });
    expect((await getPolicy(getRequest())).status).toBe(StatusCodes.OK);
    const denied = await updatePolicy(
      updateRequest({
        create: { days: 1, overrideRoleIds: [] },
        edit: { days: 0, overrideRoleIds: [] },
        financialClosingDate: null,
        expectedUpdatedAt: null,
      }),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);

    const editor = await newMember(company.workspaceId, ["read", "update"]);
    session({
      userId: editor,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const allowed = await updatePolicy(
      updateRequest({
        create: { days: 1, overrideRoleIds: [] },
        edit: { days: 0, overrideRoleIds: [] },
        financialClosingDate: null,
        expectedUpdatedAt: null,
      }),
    );
    expect(allowed.status).toBe(StatusCodes.OK);
  });

  it("is on /api/docs with ConstructionOrganization components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      spec.paths["/api/construction/organization/settings/backdated-entry"]?.[
        "get"
      ],
    ).toBeDefined();
    expect(
      spec.paths[
        "/api/construction/organization/settings/backdated-entry/update"
      ]?.["post"],
    ).toBeDefined();
    expect(
      spec.components.schemas[
        "UpdateConstructionOrganizationBackdatedEntryPolicyRequest"
      ],
    ).toBeDefined();
  });
});
