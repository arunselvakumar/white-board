import { randomUUID } from "node:crypto";

import { companies } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { createCompanyHandlers } from "./create-company-handlers";

async function newUser(): Promise<string> {
  const id = randomUUID();
  await prisma.identityUser.create({
    data: {
      id,
      name: "Arun Selva Kumar",
      email: `${id}@example.test`,
      emailVerified: true,
    },
  });
  return id;
}

describe("createCompany on Postgres (CM-104)", () => {
  it("creates the Workspace, Owner membership, profile and audit event, and no subscription", async () => {
    const userId = await newUser();
    const handlers = createCompanyHandlers();
    const created = await handlers.create.execute({
      name: "Anugraha Engineers",
      country: "IN",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      userId,
      userName: "Arun Selva Kumar",
      userMobile: null,
      userEmail: `${userId}@example.test`,
    });

    await expect(companies.listForUser(userId)).resolves.toEqual([
      { id: created.workspaceId, name: "Anugraha Engineers", role: "owner" },
    ]);
    await expect(
      prisma.constructionOrganizationCompanyProfile.findUnique({
        where: { workspaceId: created.workspaceId },
      }),
    ).resolves.toMatchObject({
      name: "Anugraha Engineers",
      gstin: "33AAPFA0939F1ZM",
      currency: "INR",
      isIndian: true,
    });
    await expect(
      prisma.constructionOrganizationSubscription.findUnique({
        where: { workspaceId: created.workspaceId },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: { workspaceId: created.workspaceId, action: "company.created" },
      }),
    ).resolves.toBe(1);
  });

  it("lets one User own several Companies", async () => {
    const userId = await newUser();
    const handlers = createCompanyHandlers();
    const input = {
      country: "IN",
      userId,
      userName: "Arun Selva Kumar",
      userMobile: null,
      userEmail: `${userId}@example.test`,
    };
    await handlers.create.execute({ ...input, name: "Anugraha Engineers" });
    await handlers.create.execute({ ...input, name: "Anugraha Land" });
    await expect(companies.listForUser(userId)).resolves.toHaveLength(2);
  });

  it("removes the Workspace when the profile cannot be written", async () => {
    const userId = await newUser();
    const failing = createCompanyHandlers({
      prisma: new Proxy(prisma, {
        get(target, property, receiver) {
          if (property === "$transaction")
            return () => Promise.reject(new Error("db down"));
          return Reflect.get(target, property, receiver) as unknown;
        },
      }),
    });
    await expect(
      failing.create.execute({
        name: "Half Made",
        country: "IN",
        userId,
        userName: "Arun Selva Kumar",
        userMobile: null,
        userEmail: `${userId}@example.test`,
      }),
    ).rejects.toThrow("db down");
    await expect(companies.listForUser(userId)).resolves.toEqual([]);
  });
});
