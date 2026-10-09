import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { recordAudit } from "./audit";
import { withTombstone } from "./tombstone";

describe("recordAudit", () => {
  it("appends to construction_organization.audit_events", async () => {
    const workspaceId = randomUUID();
    await recordAudit(prisma, {
      workspaceId,
      actorUserId: "user-1",
      action: "company_profile.updated",
      entityType: "company_profile",
      entityId: "profile-1",
      before: { gstin: null },
      after: { gstin: "33AAPFA0939F1ZM" },
    });
    const rows = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "company_profile.updated",
      before: { gstin: null },
      after: { gstin: "33AAPFA0939F1ZM" },
    });
  });
});

describe("withTombstone", () => {
  it("hides soft-deleted rows", async () => {
    const workspaceId = randomUUID();
    await prisma.constructionOrganizationCompanyProfile.create({
      data: {
        id: randomUUID(),
        workspaceId,
        createdBy: "user-1",
        updatedBy: "user-1",
        deletedAt: new Date(),
      },
    });
    await expect(
      prisma.constructionOrganizationCompanyProfile.count({
        where: withTombstone({ workspaceId }),
      }),
    ).resolves.toBe(0);
  });
});
