import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import type { StoredObject } from "@/src/shared-kernel/files";

import { CompanyDetails } from "../domain/company-details";
import type { CompanyProfile } from "../domain/company-profile";
import type { CompanyNames } from "./company-directory";
import { logoNotFound, type CompanyImages } from "./company-images";
import type { CompanyProfileStore } from "./company-profile-store";

export const profileChanged = () =>
  conflict(
    "COMPANY_PROFILE_CHANGED",
    "Someone else changed the Company profile. Reload to see their changes.",
  );

export type CompanyProfileChanges = {
  name: string;
  mobile?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  address?: string | null;
  currency: string;
  timezone: string;
};

/** What the audit keeps of a profile: everything a person typed. */
function audited(profile: CompanyProfile) {
  return {
    name: profile.name,
    mobile: profile.mobile,
    email: profile.email,
    gstin: profile.gstin,
    pan: profile.pan,
    address: profile.address,
    currency: profile.currency,
    timezone: profile.timezone,
    logoKey: profile.logoKey,
  };
}

/**
 * The Company profile (CM-115). Routes check `organization.settings` before
 * calling these. The country is fixed at creation: it decides GST, PAN and
 * TDS behaviour and which plans are offered, so it is not editable here.
 */
export class CompanyProfileHandlers {
  constructor(
    private readonly profiles: CompanyProfileStore,
    private readonly names: CompanyNames,
    private readonly images: CompanyImages,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(workspaceId: string): Promise<CompanyProfile> {
    const profile = await this.profiles.findByWorkspace(workspaceId);
    if (profile == null)
      throw notFound(
        "COMPANY_PROFILE_NOT_FOUND",
        "This Company has no profile yet.",
      );
    return profile;
  }

  private audit(
    before: CompanyProfile,
    after: CompanyProfile,
    by: string,
    action: string,
  ): AuditEvent {
    return {
      workspaceId: after.workspaceId,
      actorUserId: by,
      action,
      entityType: "company_profile",
      entityId: after.id,
      before: audited(before),
      after: audited(after),
      occurredAt: after.updatedAt,
    };
  }

  async update(input: {
    workspaceId: string;
    by: string;
    changes: CompanyProfileChanges;
    /** The `updatedAt` the form loaded; a newer row is a conflict. */
    expectedUpdatedAt?: Date;
  }): Promise<CompanyProfile> {
    const profile = await this.get(input.workspaceId);
    if (
      input.expectedUpdatedAt != null &&
      input.expectedUpdatedAt.getTime() !== profile.updatedAt.getTime()
    )
      throw profileChanged();
    const { changes } = input;
    // An omitted field stays as it is; null clears it.
    const details = CompanyDetails.create({
      name: changes.name,
      mobile: changes.mobile === undefined ? profile.mobile : changes.mobile,
      email: changes.email === undefined ? profile.email : changes.email,
      gstin: changes.gstin === undefined ? profile.gstin : changes.gstin,
      pan: changes.pan === undefined ? profile.pan : changes.pan,
      address:
        changes.address === undefined ? profile.address : changes.address,
      currency: changes.currency,
      timezone: changes.timezone,
      country: profile.country,
    });
    const next: CompanyProfile = {
      ...profile,
      ...details.value,
      isIndian: details.isIndian,
      updatedAt: this.clock(),
    };
    await this.profiles.save(next, {
      loadedAt: profile.updatedAt,
      audit: this.audit(profile, next, input.by, "company.profile_updated"),
    });
    if (next.name !== profile.name)
      await this.names.renameWorkspace(input.workspaceId, next.name);
    return next;
  }

  async setLogo(input: {
    workspaceId: string;
    by: string;
    bytes: Uint8Array;
    contentType: string | null;
  }): Promise<CompanyProfile> {
    const profile = await this.get(input.workspaceId);
    const now = this.clock();
    const file = await this.images.upload({
      workspaceId: input.workspaceId,
      kind: "company_logo",
      bytes: input.bytes,
      declaredType: input.contentType,
      by: input.by,
      now,
    });
    const next: CompanyProfile = {
      ...profile,
      logoKey: file.key,
      updatedAt: now,
    };
    await this.images.commit(file, profile.logoKey, () =>
      this.profiles.save(next, {
        loadedAt: profile.updatedAt,
        audit: this.audit(profile, next, input.by, "company.logo_changed"),
        files: { added: file, removedKey: profile.logoKey },
      }),
    );
    return next;
  }

  /** Removing a logo that is not there is not an error. */
  async removeLogo(input: {
    workspaceId: string;
    by: string;
  }): Promise<CompanyProfile> {
    const profile = await this.get(input.workspaceId);
    if (profile.logoKey == null) return profile;
    const next: CompanyProfile = {
      ...profile,
      logoKey: null,
      updatedAt: this.clock(),
    };
    await this.profiles.save(next, {
      loadedAt: profile.updatedAt,
      audit: this.audit(profile, next, input.by, "company.logo_removed"),
      files: { removedKey: profile.logoKey },
    });
    await this.images.discard(profile.logoKey);
    return next;
  }

  async logo(workspaceId: string): Promise<StoredObject> {
    const profile = await this.get(workspaceId);
    return this.images.read(profile.logoKey, logoNotFound);
  }
}
