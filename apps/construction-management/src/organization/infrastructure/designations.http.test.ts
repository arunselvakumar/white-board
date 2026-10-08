import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { createCompanyHandlers } from "./create-company-handlers";
import { createDesignationHandlers } from "./create-designation-handlers";

async function newCompany(): Promise<{ workspaceId: string; userId: string }> {
  const userId = randomUUID();
  await prisma.identityUser.create({
    data: { id: userId, name: "Owner", email: `${userId}@example.test` },
  });
  const created = await createCompanyHandlers().create.execute({
    name: "Patil Builders",
    country: "IN",
    userId,
    userName: "Owner",
    userMobile: null,
    userEmail: `${userId}@example.test`,
  });
  return { workspaceId: created.workspaceId, userId };
}

describe("Designations on Postgres (CM-106)", () => {
  const handlers = createDesignationHandlers();

  it("gives every new Company its own copy of the 38 seeds", async () => {
    const first = await newCompany();
    const second = await newCompany();
    const mine = await handlers.list(first.workspaceId);
    expect(mine).toHaveLength(38);
    const engineer = mine.find((item) => item.name === "Site Engineer");
    expect(engineer?.isSeed).toBe(true);
    expect(engineer?.template?.["labour.attendance"]).toEqual([
      "create",
      "read",
      "update",
    ]);

    // Editing one Company's copy leaves the other's alone.
    await handlers.update({
      workspaceId: first.workspaceId,
      id: engineer?.id ?? "",
      name: "Site Engineer",
      template: null,
      by: first.userId,
    });
    const theirs = await handlers.list(second.workspaceId);
    expect(
      theirs.find((item) => item.name === "Site Engineer")?.template,
    ).not.toBeNull();
  });

  it("duplicates with the template and keeps names unique among live rows", async () => {
    const { workspaceId, userId } = await newCompany();
    const admin = (await handlers.list(workspaceId)).find(
      (item) => item.name === "Admin",
    );
    const copy = await handlers.duplicate({
      workspaceId,
      id: admin?.id ?? "",
      by: userId,
    });
    expect(copy).toMatchObject({ name: "Admin (copy)", isSeed: false });
    expect(copy.template).toEqual(admin?.template);

    await expect(
      handlers.create({ workspaceId, name: "admin", by: userId }),
    ).rejects.toMatchObject({
      code: "DESIGNATION_NAME_IN_USE",
      kind: "conflict",
    });

    await handlers.delete({ workspaceId, id: copy.id, by: userId });
    await expect(
      handlers.create({ workspaceId, name: "Admin (copy)", by: userId }),
    ).resolves.toMatchObject({ name: "Admin (copy)" });
  });

  it("does not find another Company's Designation", async () => {
    const mine = await newCompany();
    const theirs = await newCompany();
    const [one] = await handlers.list(theirs.workspaceId);
    await expect(
      handlers.get(mine.workspaceId, one?.id ?? ""),
    ).rejects.toMatchObject({ code: "DESIGNATION_NOT_FOUND" });
  });
});
