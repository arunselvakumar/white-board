import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { StoredFileChange } from "./company-profile-store";

/**
 * A Team Member's photo (CM-115), kept beside the Team Member aggregate:
 * only the member themself sets it, from My Profile, and nothing about who
 * they are or what they may do depends on it.
 */
export type MemberPhotoStore = {
  photoKey(workspaceId: string, memberId: string): Promise<string | null>;
  /**
   * Points the member at `key` (or none), records the file change and the
   * audit event atomically. Throws `PHOTO_CHANGED` (409) unless the stored
   * key is still `loadedKey`.
   */
  setPhoto(input: {
    workspaceId: string;
    memberId: string;
    key: string | null;
    loadedKey: string | null;
    by: string;
    now: Date;
    files: StoredFileChange;
    audit: AuditEvent;
  }): Promise<void>;
};
