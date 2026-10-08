import { randomUUID } from "node:crypto";

import { companies } from "@repo/auth/construction/server";
import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { createCompanyHandlers } from "./create-company-handlers";

async function newUser(): Promise<string> {
  const id = randomUUID();
  await prisma.identityUser.create({
    data: {
      id,
      name: "Ramesh Patil",
      email: `${id}@example.test`,
      emailVerified: true,
    },
  });
  return id;
}

describe("createCompany on Postgres (CM-104)", () => {
  it("creates the Workspace, Owner membership, profile, trial and audit event", async () => {
    const userId = await newUser();
    const handlers = createCompanyHandlers();
    const created = await handlers.create.execute({
      name: "Patil Builders",
      country: "IN",
      gstin: "27AAPFU0939F1ZV",
      pan: "AAPFU0939F",
      userId,
      userName: "Ramesh Patil",
      userMobile: null,
      userEmail: `${userId}@example.test`,
    });

    await expect(companies.listForUser(userId)).resolves.toEqual([
      { id: created.workspaceId, name: "Patil Builders", role: "owner" },
    ]);
    await expect(
      prisma.constructionOrganizationCompanyProfile.findUnique({
        where: { workspaceId: created.workspaceId },
      }),
    ).resolves.toMatchObject({
      name: "Patil Builders",
      gstin: "27AAPFU0939F1ZV",
      currency: "INR",
      isIndian: true,
    });
    const trial =
      await prisma.constructionOrganizationSubscription.findUniqueOrThrow({
        where: { workspaceId: created.workspaceId },
      });
    expect(trial.isTrial).toBe(true);
    expect(trial.endsAt.getTime() - trial.startsAt.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
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
      userName: "Ramesh Patil",
      userMobile: null,
      userEmail: `${userId}@example.test`,
    };
    await handlers.create.execute({ ...input, name: "Patil Builders" });
    await handlers.create.execute({ ...input, name: "Patil Land" });
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
        userName: "Ramesh Patil",
        userMobile: null,
        userEmail: `${userId}@example.test`,
      }),
    ).rejects.toThrow("db down");
    await expect(companies.listForUser(userId)).resolves.toEqual([]);
  });
});
