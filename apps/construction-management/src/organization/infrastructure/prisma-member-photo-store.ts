import type { PrismaClient } from "@repo/db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type { StoredFileChange } from "../application/company-profile-store";
import type { MemberPhotoStore } from "../application/member-photo-store";

/** `team_members.photo_key`, written apart from the aggregate's columns. */
export class PrismaMemberPhotoStore implements MemberPhotoStore {
  constructor(private readonly db: PrismaClient) {}

  async photoKey(
    workspaceId: string,
    memberId: string,
  ): Promise<string | null> {
    const row = await this.db.constructionOrganizationTeamMember.findFirst({
      where: { id: memberId, workspaceId, deletedAt: null },
      select: { photoKey: true },
    });
    return row?.photoKey ?? null;
  }

  async setPhoto(input: {
    workspaceId: string;
    memberId: string;
    key: string | null;
    loadedKey: string | null;
    by: string;
    now: Date;
    files: StoredFileChange;
    audit: AuditEvent;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const written = await tx.constructionOrganizationTeamMember.updateMany({
        where: {
          id: input.memberId,
          workspaceId: input.workspaceId,
          photoKey: input.loadedKey,
          deletedAt: null,
        },
        data: { photoKey: input.key },
      });
      if (written.count === 0)
        throw conflict(
          "PHOTO_CHANGED",
          "Your photo was changed somewhere else. Reload and try again.",
        );
      if (input.files.removedKey != null)
        await markStoredFileDeleted(
          tx,
          input.workspaceId,
          input.files.removedKey,
          input.now,
        );
      if (input.files.added != null)
        await recordStoredFile(tx, input.files.added);
      await recordAudit(tx, input.audit);
    });
  }
}
