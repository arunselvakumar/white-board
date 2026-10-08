import type { AuditEvent } from "@/src/shared-kernel/audit";
import { notFound } from "@/src/shared-kernel/domain-error";
import type { StoredObject } from "@/src/shared-kernel/files";
import { maskIdentifier } from "@/src/shared-kernel/tax-ids";

import type { DesignationRepository } from "../domain/designation-repository";
import { teamMemberDetails, type TeamMember } from "../domain/team-member";
import type { TeamMemberRepository } from "../domain/team-member-repository";
import { photoNotFound, type CompanyImages } from "./company-images";
import type { MemberPhotoStore } from "./member-photo-store";
import {
  toTeamMemberReadModel,
  type TeamMemberReadModel,
} from "./team-member-read-model";

export type MyProfile = TeamMemberReadModel & { photoKey: string | null };

/**
 * What a member may change about themself. Mobile is how they sign in and
 * Designation is the Owner's call, so neither is here. An omitted field
 * stays as it is; null clears it.
 */
export type MyProfileChanges = {
  name: string;
  email?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
};

function masked(value: string | null): string | null {
  return value == null ? null : maskIdentifier(value);
}

/** What the audit keeps: identity numbers masked, never in full. */
function audited(member: TeamMember) {
  const { details } = member;
  return {
    name: details.name,
    email: details.email,
    address: details.address,
    emergencyContact: details.emergencyContact,
    aadhaar: masked(details.aadhaar),
    pan: masked(details.pan),
  };
}

/**
 * My Profile (CM-115): the signed-in User's own Team Member record in the
 * Active Company. Any member may read and change their own; routes pass
 * the Session's User, never an id from the request.
 */
export class MyProfileHandlers {
  constructor(
    private readonly members: TeamMemberRepository,
    private readonly designations: DesignationRepository,
    private readonly photos: MemberPhotoStore,
    private readonly images: CompanyImages,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async mine(workspaceId: string, userId: string): Promise<TeamMember> {
    const member = await this.members.findByUser(workspaceId, userId);
    if (member == null)
      throw notFound(
        "MY_PROFILE_NOT_FOUND",
        "You have no Team Member record in this Company.",
      );
    return member;
  }

  private async view(member: TeamMember): Promise<MyProfile> {
    const [designations, photoKey] = await Promise.all([
      this.designations.listAll(member.workspaceId),
      this.photos.photoKey(member.workspaceId, member.id),
    ]);
    const names = new Map(designations.map((item) => [item.id, item.name]));
    return { ...toTeamMemberReadModel(member, names), photoKey };
  }

  private audit(member: TeamMember, by: string, action: string): AuditEvent {
    return {
      workspaceId: member.workspaceId,
      actorUserId: by,
      action,
      entityType: "team_member",
      entityId: member.id,
    };
  }

  async get(workspaceId: string, userId: string): Promise<MyProfile> {
    return this.view(await this.mine(workspaceId, userId));
  }

  async update(input: {
    workspaceId: string;
    userId: string;
    changes: MyProfileChanges;
  }): Promise<MyProfile> {
    const member = await this.mine(input.workspaceId, input.userId);
    const before = audited(member);
    const { changes } = input;
    const current = member.details;
    const details = teamMemberDetails({
      name: changes.name,
      designationId: current.designationId,
      mobile: current.mobile,
      email: changes.email === undefined ? current.email : changes.email,
      address:
        changes.address === undefined ? current.address : changes.address,
      emergencyContact:
        changes.emergencyContact === undefined
          ? current.emergencyContact
          : changes.emergencyContact,
      aadhaar:
        changes.aadhaar === undefined ? current.aadhaar : changes.aadhaar,
      pan: changes.pan === undefined ? current.pan : changes.pan,
    });
    member.updateDetails(details, input.userId, this.clock());
    await this.members.save(member, {
      ...this.audit(member, input.userId, "team_member.profile_updated"),
      before,
      after: audited(member),
    });
    return this.view(member);
  }

  /**
   * A member may always see their own Aadhaar and PAN. Logged every time;
   * an OTP step arrives with M9, as for reveals by others (CM-108).
   */
  async revealIdentifiers(input: {
    workspaceId: string;
    userId: string;
  }): Promise<{ aadhaar: string | null; pan: string | null }> {
    const member = await this.mine(input.workspaceId, input.userId);
    await this.members.save(member, {
      ...this.audit(member, input.userId, "team_member.identifiers_revealed"),
      after: { self: true },
    });
    return { aadhaar: member.details.aadhaar, pan: member.details.pan };
  }

  async setPhoto(input: {
    workspaceId: string;
    userId: string;
    bytes: Uint8Array;
    contentType: string | null;
  }): Promise<MyProfile> {
    const member = await this.mine(input.workspaceId, input.userId);
    const loadedKey = await this.photos.photoKey(member.workspaceId, member.id);
    const now = this.clock();
    const file = await this.images.upload({
      workspaceId: member.workspaceId,
      kind: "member_photo",
      bytes: input.bytes,
      declaredType: input.contentType,
      by: input.userId,
      now,
    });
    await this.images.commit(file, loadedKey, () =>
      this.photos.setPhoto({
        workspaceId: member.workspaceId,
        memberId: member.id,
        key: file.key,
        loadedKey,
        by: input.userId,
        now,
        files: { added: file, removedKey: loadedKey },
        audit: {
          ...this.audit(member, input.userId, "team_member.photo_changed"),
          before: { photoKey: loadedKey },
          after: { photoKey: file.key },
          occurredAt: now,
        },
      }),
    );
    return this.view(member);
  }

  /** Removing a photo that is not there is not an error. */
  async removePhoto(input: {
    workspaceId: string;
    userId: string;
  }): Promise<MyProfile> {
    const member = await this.mine(input.workspaceId, input.userId);
    const loadedKey = await this.photos.photoKey(member.workspaceId, member.id);
    if (loadedKey == null) return this.view(member);
    const now = this.clock();
    await this.photos.setPhoto({
      workspaceId: member.workspaceId,
      memberId: member.id,
      key: null,
      loadedKey,
      by: input.userId,
      now,
      files: { removedKey: loadedKey },
      audit: {
        ...this.audit(member, input.userId, "team_member.photo_removed"),
        before: { photoKey: loadedKey },
        after: { photoKey: null },
        occurredAt: now,
      },
    });
    await this.images.discard(loadedKey);
    return this.view(member);
  }

  async photo(workspaceId: string, userId: string): Promise<StoredObject> {
    const member = await this.mine(workspaceId, userId);
    return this.images.read(
      await this.photos.photoKey(member.workspaceId, member.id),
      photoNotFound,
    );
  }
}
