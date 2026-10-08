import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files";

import type { CompanyProfile } from "../domain/company-profile";
import type { CompanyProfileReader } from "./company-profile-reader";

/** Files that came or went with a change: recorded for storage usage. */
export type StoredFileChange = {
  added?: NewStoredFile;
  removedKey?: string | null;
};

export type CompanyProfileStore = CompanyProfileReader & {
  /**
   * Writes the profile, its file records and the audit event atomically.
   * Throws `COMPANY_PROFILE_CHANGED` (409) unless the stored row still has
   * `loadedAt` as its `updatedAt`, so two people saving never lose a change.
   */
  save(
    profile: CompanyProfile,
    change: { loadedAt: Date; audit: AuditEvent; files?: StoredFileChange },
  ): Promise<void>;
};
