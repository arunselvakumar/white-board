import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { newId } from "../ids";
import type { SequenceModuleKey } from "./modules";
import { nextSequenceNumber } from "./next-sequence-number";

function issue(input: {
  workspaceId: string;
  module?: SequenceModuleKey;
  projectId?: string | null;
  date?: string;
}) {
  return prisma.$transaction(
    (tx) =>
      nextSequenceNumber(tx, {
        workspaceId: input.workspaceId,
        module: input.module ?? "purchase_request",
        projectId: input.projectId ?? null,
        date: input.date ?? "2026-10-08",
        by: "user-1",
      }),
    { maxWait: 20_000, timeout: 20_000 },
  );
}

async function saveRule(input: {
  workspaceId: string;
  module?: SequenceModuleKey;
  projectId?: string | null;
  prefix: string;
  projectToken?: string;
  startNumber?: number;
  fiscalYearToken?: boolean;
}): Promise<string> {
  const id = newId();
  await prisma.constructionOrganizationSequenceRule.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      module: input.module ?? "purchase_request",
      projectId: input.projectId ?? null,
      prefix: input.prefix,
      projectToken: input.projectToken ?? "",
      startNumber: input.startNumber ?? 1,
      fiscalYearToken: input.fiscalYearToken ?? true,
      createdBy: "user-1",
      updatedBy: "user-1",
    },
  });
  return id;
}

describe("nextSequenceNumber on Postgres (CM-114)", () => {
  it("gives 20 concurrent callers 20 distinct consecutive numbers", async () => {
    const workspaceId = randomUUID();
    const issued = await Promise.all(
      Array.from({ length: 20 }, () => issue({ workspaceId })),
    );
    const sequences = issued.map((item) => item.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(issued.map((item) => item.number)).size).toBe(20);
    // The standard default rule was saved once, by the first caller.
    const rules = await prisma.constructionOrganizationSequenceRule.findMany({
      where: { workspaceId },
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ prefix: "PR", projectId: null });
    expect(issued.map((item) => item.number)).toContain("PR/26-27/00020");
  });

  it("restarts the counter on 1 April and keeps each fiscal year apart", async () => {
    const workspaceId = randomUUID();
    await saveRule({ workspaceId, prefix: "PO", module: "purchase_order" });
    const march = await issue({
      workspaceId,
      module: "purchase_order",
      date: "2027-03-31",
    });
    const april = await issue({
      workspaceId,
      module: "purchase_order",
      date: "2027-04-01",
    });
    const march2 = await issue({
      workspaceId,
      module: "purchase_order",
      date: "2027-03-30",
    });
    expect([march.number, april.number, march2.number]).toEqual([
      "PO/26-27/00001",
      "PO/27-28/00001",
      "PO/26-27/00002",
    ]);
  });

  it("never restarts without the fiscal-year token", async () => {
    const workspaceId = randomUUID();
    await saveRule({
      workspaceId,
      prefix: "DN",
      module: "delivery_note",
      fiscalYearToken: false,
    });
    const first = await issue({
      workspaceId,
      module: "delivery_note",
      date: "2027-03-31",
    });
    const second = await issue({
      workspaceId,
      module: "delivery_note",
      date: "2027-04-01",
    });
    expect([first.number, second.number]).toEqual(["DN/00001", "DN/00002"]);
  });

  it("prefers the project's rule and falls back to the default", async () => {
    const workspaceId = randomUUID();
    const projectId = randomUUID();
    await saveRule({ workspaceId, prefix: "PR", startNumber: 100 });
    await saveRule({
      workspaceId,
      prefix: "PR",
      projectId,
      projectToken: "P1",
    });
    expect((await issue({ workspaceId, projectId })).number).toBe(
      "PR/26-27/P1/00001",
    );
    expect((await issue({ workspaceId, projectId: randomUUID() })).number).toBe(
      "PR/26-27/00100",
    );
  });

  it("gives a rolled-back number back, so there are no gaps", async () => {
    const workspaceId = randomUUID();
    await issue({ workspaceId });
    await expect(
      prisma.$transaction(async (tx) => {
        await nextSequenceNumber(tx, {
          workspaceId,
          module: "purchase_request",
          projectId: null,
          date: "2026-10-08",
          by: "user-1",
        });
        throw new Error("document insert failed");
      }),
    ).rejects.toThrow("document insert failed");
    expect((await issue({ workspaceId })).sequence).toBe(2);
  });
});
