import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { GrnFieldSettingStore } from "../application/grn-field-setting-handlers";
import {
  grnFieldSettingChanged,
  storedGrnHiddenFields,
  type GrnFieldSetting,
  type GrnOptionalField,
} from "../domain/grn-field-setting";

export class PrismaGrnFieldSettingStore implements GrnFieldSettingStore {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string): Promise<GrnFieldSetting> {
    const row =
      await this.db.constructionOrganizationGrnFieldSetting.findUnique({
        where: { workspaceId },
      });
    if (row == null) return { hiddenFields: [], updatedAt: null };
    return {
      hiddenFields: storedGrnHiddenFields(row.hiddenFields),
      updatedAt: row.updatedAt,
    };
  }

  async save(input: {
    workspaceId: string;
    hiddenFields: GrnOptionalField[];
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Lock the row so two saves cannot both pass the check below.
        const locked = await tx.$queryRaw<
          { hidden_fields: string[]; updated_at: Date }[]
        >`
          SELECT hidden_fields, updated_at
          FROM construction_organization.grn_field_settings
          WHERE workspace_id = ${input.workspaceId}
          FOR UPDATE
        `;
        const row = locked[0] ?? null;
        if (
          (row?.updated_at.getTime() ?? null) !==
          (input.expectedUpdatedAt?.getTime() ?? null)
        )
          throw grnFieldSettingChanged();
        await tx.constructionOrganizationGrnFieldSetting.upsert({
          where: { workspaceId: input.workspaceId },
          create: {
            workspaceId: input.workspaceId,
            hiddenFields: input.hiddenFields,
            updatedAt: input.now,
            updatedBy: input.by,
          },
          update: {
            hiddenFields: input.hiddenFields,
            updatedAt: input.now,
            updatedBy: input.by,
          },
        });
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "grn_fields.updated",
          entityType: "grn_field_setting",
          entityId: input.workspaceId,
          before: {
            hiddenFields:
              row == null ? [] : storedGrnHiddenFields(row.hidden_fields),
          },
          after: { hiddenFields: input.hiddenFields },
          occurredAt: input.now,
        });
      });
    } catch (error) {
      // Two first saves racing: the loser hits the workspace primary key.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw grnFieldSettingChanged();
      throw error;
    }
  }
}
