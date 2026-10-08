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

export type MyProfile = TeamMemberReadModel & {
  photoKey: string | null;
  /** False while the mobile is a way to sign in (SMS on, ADR CM-0009). */
  mobileEditable: boolean;
};

/**
 * What a member may change about themself. Designation is the Owner's call,
 * so it is not here. Mobile is applied only while SMS is off (ADR CM-0009);
 * while it is on the mobile is their sign-in and is ignored. An omitted
 * field stays as it is; null clears it.
 */
export type MyProfileChanges = {
  name: string;
  mobile?: string | null;
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
    mobile: details.mobile,
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
    /** Whether a mobile is a way to sign in (SMS on, ADR CM-0009). */
    private readonly mobileSignIn: () => boolean = () => true,
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
    return {
      ...toTeamMemberReadModel(member, names),
      photoKey,
      mobileEditable: !this.mobileSignIn(),
    };
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
    const mobileIsSignIn = this.mobileSignIn();
    const details = teamMemberDetails({
      name: changes.name,
      designationId: current.designationId,
      mobile:
        mobileIsSignIn || changes.mobile === undefined
          ? current.mobile
          : changes.mobile,
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
    member.updateDetails(details, input.userId, this.clock(), {
      mobileIsSignIn,
    });
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
