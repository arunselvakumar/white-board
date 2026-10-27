import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { POST as schedule } from "@/app/api/construction/organization/company-deletion/route";
import { companyFileKey } from "@/src/shared-kernel/files";
import { recordStoredFile } from "@/src/shared-kernel/files/stored-files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";
import { addNotificationAndPreference, codeFor } from "@/test/accounts";
import {
  addProject,
  givePlan,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addMaterial, addStore, addSupplier } from "@/test/procurement";
import { trackingMaster, trackingTaskRow } from "@/test/tracking";
import { TEST_ORIGIN } from "@/test/sessions";

import {
  COMPANY_PURGE_JOB,
  KEPT_TABLES,
  companyPurgeQueueHandler,
  deletionOrder,
} from "./company-purge";
import { drainQueue, enqueue } from "./queue";

/** Rows per `schema.table` with this workspace id, in every Company table. */
async function rowsOf(workspaceId: string): Promise<Record<string, number>> {
  const tables = await prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
    SELECT c.table_schema || '.' || c.table_name AS name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.column_name = 'workspace_id'
      AND c.table_schema LIKE 'construction\\_%'
      AND t.table_type = 'BASE TABLE'
    ORDER BY 1
  `);
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [schema, table] = name.split(".");
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${schema ?? ""}"."${table ?? ""}" WHERE workspace_id = $1`,
      workspaceId,
    );
    counts[name] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

function nonZero(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).filter(([, count]) => count > 0),
  );
}

/** A Company with rows in most contexts, a stored file and a paid order. */
async function busyCompany(name: string) {
  const owner = await ownerWithCompany(name);
  const member = await memberWith(owner, {
    "organization.team_members": ["read"],
  });
  const projectId = await addProject(owner.workspaceId, owner.userId);
  await addMaterial(owner.workspaceId, owner.userId);
  await addSupplier(owner.workspaceId, owner.userId, {
    projectIds: [projectId],
  });
  await addStore(owner.workspaceId, owner.userId, [projectId]);
  const tagId = await trackingMaster("tag", owner.workspaceId, owner.userId);
  await trackingTaskRow(owner.workspaceId, projectId, owner.userId, {
    tagIds: [tagId],
  });
  await prisma.$transaction((tx) =>
    nextSequenceNumber(tx, {
      workspaceId: owner.workspaceId,
      module: "purchase_request",
      projectId: null,
      date: "2026-10-16",
      by: owner.userId,
    }),
  );
  await addNotificationAndPreference(owner.workspaceId, member.userId);
  await enqueue({
    type: "report",
    workspaceId: owner.workspaceId,
    payload: { reportJobId: randomUUID() },
    runAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
  await givePlan(owner.workspaceId);
  await prisma.constructionOrganizationSubscriptionOrder.create({
    data: {
      id: randomUUID(),
      workspaceId: owner.workspaceId,
      kind: "new",
      planCode: "basic",
      planName: "Basic",
      months: 6,
      addOns: {},
      lines: [],
      catalogueVersion: 1,
      subTotal: 1_400_000,
      lastPlanDiscount: 0,
      taxableAmount: 1_400_000,
      cgst: 126_000,
      sgst: 126_000,
      igst: 0,
      total: 1_652_000,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      billingName: name,
      billingAddress: "12, Anna Salai, Chennai",
      billingStateCode: "33",
      seller: {},
      gatewayOrderId: `order_${randomUUID()}`,
      status: "paid",
      invoiceNumber: `INV/${randomUUID().slice(0, 8)}`,
      createdBy: owner.userId,
      paidAt: new Date(),
    },
  });
  const key = companyFileKey(owner.workspaceId, "purge-test", "txt");
  await objectStorage().put(
    key,
    new TextEncoder().encode("hello"),
    "text/plain",
  );
  await recordStoredFile(prisma, {
    workspaceId: owner.workspaceId,
    key,
    kind: "test",
    contentType: "text/plain",
    bytes: 5,
    createdBy: owner.userId,
  });
  // An object no `stored_files` row names (a report output, say).
  const unrecorded = companyFileKey(owner.workspaceId, "reports", "pdf");
  await objectStorage().put(
    unrecorded,
    new Uint8Array([1, 2, 3]),
    "application/pdf",
  );
  return { owner, member, key, unrecorded };
}

describe("deletionOrder", () => {
  it("puts children before the tables they point at, cycles last", () => {
    expect(
      deletionOrder(
        ["s.parent", "s.child", "s.grandchild", "s.loop_a", "s.loop_b"],
        [
          { child: "s.child", parent: "s.parent" },
          { child: "s.grandchild", parent: "s.child" },
          { child: "s.loop_a", parent: "s.loop_b" },
          { child: "s.loop_b", parent: "s.loop_a" },
          { child: "s.parent", parent: "s.parent" },
        ],
      ),
    ).toEqual(["s.grandchild", "s.child", "s.parent", "s.loop_a", "s.loop_b"]);
  });
});

describe("organization.company_purge (CM-907)", () => {
  it("deletes every row of a due Company in every schema, its files, memberships and Workspace; keeps invoices and the record", async () => {
    const doomed = await busyCompany("Anugraha Engineers");
    const other = await busyCompany("Velan Builders");
    const before = await rowsOf(doomed.owner.workspaceId);
    const otherBefore = await rowsOf(other.owner.workspaceId);
    // The seed reaches several contexts.
    const schemas = new Set(
      Object.keys(nonZero(before)).map((name) => name.split(".")[0]),
    );
    for (const schema of [
      "construction_organization",
      "construction_projects",
      "construction_masters",
      "construction_procurement",
      "construction_tracking",
      "construction_messaging",
    ])
      expect(schemas).toContain(schema);

    const code = await codeFor(doomed.owner, "delete_company");
    const scheduled = await schedule(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/organization/company-deletion`,
        doomed.owner.cookie,
        { companyName: "Anugraha Engineers", code },
      ),
    );
    expect(scheduled.status).toBe(201);
    // Not due yet: the job leaves it.
    const handler = companyPurgeQueueHandler();
    const early = await enqueue({
      type: COMPANY_PURGE_JOB,
      workspaceId: null,
      payload: {},
    });
    await drainQueue({ ids: [early], handlers: [handler] });
    expect(nonZero(await rowsOf(doomed.owner.workspaceId))).not.toEqual({});

    // The cooling-off ends.
    await prisma.constructionOrganizationCompanyDeletion.updateMany({
      where: { deletedWorkspaceId: doomed.owner.workspaceId },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });
    const job = await enqueue({
      type: COMPANY_PURGE_JOB,
      workspaceId: null,
      payload: {},
    });
    const drained = await drainQueue({ ids: [job], handlers: [handler] });
    expect(drained.failed).toBe(0);

    const after = await rowsOf(doomed.owner.workspaceId);
    const left = nonZero(after);
    expect(Object.keys(left).every((name) => KEPT_TABLES.has(name))).toBe(true);
    expect(left).toEqual({
      "construction_organization.subscriptions": 1,
      "construction_organization.subscription_orders": 1,
    });

    // Files, memberships and the Workspace are gone.
    await expect(objectStorage().head(doomed.key)).resolves.toBeNull();
    await expect(objectStorage().head(doomed.unrecorded)).resolves.toBeNull();
    await expect(
      prisma.identityWorkspace.count({
        where: { id: doomed.owner.workspaceId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.identityWorkspaceMember.count({
        where: { organizationId: doomed.owner.workspaceId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.identitySession.count({
        where: { activeOrganizationId: doomed.owner.workspaceId },
      }),
    ).resolves.toBe(0);
    // The Users themselves stay.
    await expect(
      prisma.identityUser.count({ where: { id: doomed.owner.userId } }),
    ).resolves.toBe(1);

    // The record stays, completed, with what was deleted.
    const record =
      await prisma.constructionOrganizationCompanyDeletion.findFirstOrThrow({
        where: { deletedWorkspaceId: doomed.owner.workspaceId },
      });
    expect(record.completedAt).not.toBeNull();
    const summary = record.summary as Record<string, number>;
    expect(summary["construction_projects.projects"]).toBe(1);
    expect(summary["construction_organization.sequence_counters"]).toBe(1);
    expect(summary["storage.objects"]).toBe(2);
    // Scheduling added its own audit and code rows since `before`.
    for (const [table, count] of Object.entries(nonZero(before)))
      if (!KEPT_TABLES.has(table))
        expect(summary[table]).toBeGreaterThanOrEqual(count);

    // Another Company is untouched.
    expect(await rowsOf(other.owner.workspaceId)).toEqual(otherBefore);
    await expect(objectStorage().head(other.key)).resolves.not.toBeNull();
    await expect(
      prisma.identityWorkspace.count({
        where: { id: other.owner.workspaceId },
      }),
    ).resolves.toBe(1);
    // Seeds two busy Companies across every schema: over 4 s on CI.
  }, 30_000);
});
