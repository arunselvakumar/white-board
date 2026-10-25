import { randomBytes } from "node:crypto";

import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  isValidAadhaar,
  isValidPan,
  normalizeAadhaar,
} from "@/src/shared-kernel/tax-ids";

/** Normal Team Members work on Projects; HRMS ones only use HRMS (ADR CM-0002). */
export type MemberType = "normal" | "hrms";

/** `left`: the User deleted their account; the record stays (CM-907). */
export type TeamMemberStatus =
  "joining_pending" | "active" | "rejected" | "left";

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TeamMemberDetails = {
  name: string;
  designationId: string;
  /**
   * E.164. A contact; also a way to sign in and join while SMS is on
   * (ADR CM-0009). Mobile or email is required.
   */
  mobile: string | null;
  email: string | null;
  address: string | null;
  /** Plain while in memory; stored encrypted (CM-108). */
  aadhaar: string | null;
  pan: string | null;
  emergencyContact: string | null;
};

function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

/** Validates and tidies a Team Member's details (`modules/01` TeamMember). */
export function teamMemberDetails(input: {
  name: string;
  designationId: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  emergencyContact?: string | null;
}): TeamMemberDetails {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(
      "MEMBER_NAME_REQUIRED",
      "Enter the Team Member's name.",
    );
  if (name.length > 100)
    throw new DomainError(
      "MEMBER_NAME_TOO_LONG",
      "Name must be at most 100 characters.",
    );
  if (input.designationId.trim().length === 0)
    throw new DomainError("DESIGNATION_REQUIRED", "Choose a Designation.");
  const mobile = optional(input.mobile);
  if (mobile != null && !E164.test(mobile))
    throw new DomainError("MOBILE_INVALID", "Enter a valid mobile number.");
  const email = optional(input.email)?.toLowerCase() ?? null;
  if (email != null && !EMAIL.test(email))
    throw new DomainError("EMAIL_INVALID", "Enter a valid email address.");
  if (mobile == null && email == null)
    throw new DomainError(
      "MOBILE_OR_EMAIL_REQUIRED",
      "Enter an email to invite them, or at least a mobile number.",
    );
  const aadhaarRaw = optional(input.aadhaar);
  const aadhaar = aadhaarRaw == null ? null : normalizeAadhaar(aadhaarRaw);
  if (aadhaar != null && !isValidAadhaar(aadhaar))
    throw new DomainError(
      "AADHAAR_INVALID",
      "Enter a valid 12-digit Aadhaar number.",
    );
  const pan = optional(input.pan)?.toUpperCase() ?? null;
  if (pan != null && !isValidPan(pan))
    throw new DomainError("PAN_INVALID", "Enter a valid 10-character PAN.");
  const address = optional(input.address);
  if (address != null && address.length > 500)
    throw new DomainError(
      "ADDRESS_TOO_LONG",
      "Address must be at most 500 characters.",
    );
  const emergencyContact = optional(input.emergencyContact);
  if (emergencyContact != null && emergencyContact.length > 120)
    throw new DomainError(
      "EMERGENCY_CONTACT_TOO_LONG",
      "Emergency contact must be at most 120 characters.",
    );
  return {
    name,
    designationId: input.designationId,
    mobile,
    email,
    address,
    aadhaar,
    pan,
    emergencyContact,
  };
}

/** The largest monthly salary in paise (₹2 crore), as a Labour's wage. */
export const MAX_MONTHLY_SALARY = 2_000_000_000;

/**
 * An optional monthly salary in paise (ADR CM-0032): null or 0 is none.
 * Separate from the HRMS salary set-up the salary run reads.
 */
export function monthlySalary(value: number | null | undefined): number | null {
  if (value == null || value === 0) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONTHLY_SALARY)
    throw new DomainError(
      "SALARY_INVALID",
      "The salary must be a positive amount in paise, at most ₹2 crore a month.",
    );
  return value;
}

/** An unguessable token for the invite link (`/join/<token>`). */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export type TeamMemberProps = {
  id: string;
  workspaceId: string;
  /** Set when the invitee accepts (or for the Owner from the start). */
  userId: string | null;
  details: TeamMemberDetails;
  /** Paise a month, or null (ADR CM-0032). */
  monthlySalary: number | null;
  memberType: MemberType;
  isOwner: boolean;
  status: TeamMemberStatus;
  projectIds: readonly string[];
  /**
   * What they may do (ADR CM-0030): read through the Role on every
   * request. Null for the Owner, who can do everything; a Member without a
   * Role can do nothing.
   */
  roleId: string | null;
  inviteToken: string | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * A User's employee record inside one Company (`modules/01`, CM-108). Added
 * by the Owner or a Team Member with `organization.team_members` create; the
 * record is the Join Request until the invitee accepts (ADR CM-0002).
 */
export class TeamMember {
  private constructor(private props: TeamMemberProps) {}

  /** A new Team Member: Joining Pending, with an invite link. */
  static invite(input: {
    id: string;
    workspaceId: string;
    details: TeamMemberDetails;
    monthlySalary?: number | null;
    memberType: MemberType;
    projectIds?: readonly string[];
    roleId: string | null;
    by: string;
    now: Date;
  }): TeamMember {
    const member = new TeamMember({
      id: input.id,
      workspaceId: input.workspaceId,
      userId: null,
      details: input.details,
      monthlySalary: monthlySalary(input.monthlySalary),
      memberType: input.memberType,
      isOwner: false,
      status: "joining_pending",
      projectIds: [],
      roleId: input.roleId,
      inviteToken: newInviteToken(),
      invitedAt: input.now,
      joinedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
    member.assignToProjects(input.projectIds ?? [], input.by, input.now);
    return member;
  }

  /** The Company creator's own record: active, Owner, never invited. */
  static owner(input: {
    id: string;
    workspaceId: string;
    userId: string;
    details: TeamMemberDetails;
    now: Date;
  }): TeamMember {
    return new TeamMember({
      id: input.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      details: input.details,
      monthlySalary: null,
      memberType: "normal",
      isOwner: true,
      status: "active",
      projectIds: [],
      roleId: null,
      inviteToken: null,
      invitedAt: null,
      joinedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.userId,
      updatedBy: input.userId,
      deletedAt: null,
    });
  }

  static reconstitute(props: TeamMemberProps): TeamMember {
    return new TeamMember(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get userId(): string | null {
    return this.props.userId;
  }
  get details(): TeamMemberDetails {
    return this.props.details;
  }
  get monthlySalary(): number | null {
    return this.props.monthlySalary;
  }
  get memberType(): MemberType {
    return this.props.memberType;
  }
  get isOwner(): boolean {
    return this.props.isOwner;
  }
  get status(): TeamMemberStatus {
    return this.props.status;
  }
  get projectIds(): readonly string[] {
    return this.props.projectIds;
  }
  get roleId(): string | null {
    return this.props.roleId;
  }
  get inviteToken(): string | null {
    return this.props.inviteToken;
  }
  get invitedAt(): Date | null {
    return this.props.invitedAt;
  }
  get joinedAt(): Date | null {
    return this.props.joinedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  private touch(by: string, now: Date): void {
    this.props = { ...this.props, updatedAt: now, updatedBy: by };
  }

  /**
   * `mobileIsSignIn` is false while SMS is off (ADR CM-0009): the mobile is
   * then only a contact, so anyone allowed to edit may correct it.
   */
  updateDetails(
    details: TeamMemberDetails,
    by: string,
    now: Date,
    { mobileIsSignIn = true }: { mobileIsSignIn?: boolean } = {},
  ): void {
    if (
      mobileIsSignIn &&
      this.props.status !== "joining_pending" &&
      details.mobile !== this.props.details.mobile &&
      !this.props.isOwner
    ) {
      // A joined member signs in with this number; changing it here would
      // not change their sign-in.
      throw new DomainError(
        "MOBILE_LOCKED",
        "A joined Team Member's mobile is their sign-in; they change it in My Profile.",
        { kind: "conflict" },
      );
    }
    this.props = { ...this.props, details };
    this.touch(by, now);
  }

  /** Sets or clears the monthly salary (ADR CM-0032). */
  setMonthlySalary(paise: number | null, by: string, now: Date): void {
    const salary = monthlySalary(paise);
    if (salary === this.props.monthlySalary) return;
    this.props = { ...this.props, monthlySalary: salary };
    this.touch(by, now);
  }

  /** Normal ↔ HRMS. HRMS members have no projects; the Role stays. */
  changeType(memberType: MemberType, by: string, now: Date): void {
    if (this.props.isOwner && memberType === "hrms")
      throw conflict(
        "OWNER_IS_NORMAL",
        "The Owner cannot be an HRMS Team Member.",
      );
    this.props = {
      ...this.props,
      memberType,
      projectIds: memberType === "hrms" ? [] : this.props.projectIds,
    };
    this.touch(by, now);
  }

  /** Gives them another Role (ADR CM-0030). The Owner has none. */
  setRole(roleId: string, by: string, now: Date): void {
    if (this.props.isOwner)
      throw conflict(
        "OWNER_HAS_NO_ROLE",
        "The Owner can do everything and has no Role.",
      );
    this.props = { ...this.props, roleId };
    this.touch(by, now);
  }

  /** Project ids are stored as given (projects arrive with CM-204). */
  assignToProjects(projectIds: readonly string[], by: string, now: Date): void {
    const unique = [
      ...new Set(projectIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (this.props.memberType === "hrms" && unique.length > 0)
      throw new DomainError(
        "HRMS_MEMBER_HAS_NO_PROJECTS",
        "HRMS Team Members are not assigned to Projects.",
      );
    this.props = { ...this.props, projectIds: unique };
    this.touch(by, now);
  }

  /** The invitee accepted the Join Request (CM-109). */
  accept(userId: string, now: Date): void {
    if (this.props.status !== "joining_pending")
      throw conflict(
        "JOIN_REQUEST_CLOSED",
        "This Join Request is no longer pending.",
      );
    this.props = {
      ...this.props,
      userId,
      status: "active",
      joinedAt: now,
      inviteToken: null,
      updatedAt: now,
      updatedBy: userId,
    };
  }

  /**
   * The admin set a first password and the sign-in account was made for
   * them (ADR CM-0030 §6): Active at once, with no Join Request.
   */
  linkAccount(userId: string, by: string, now: Date): void {
    if (this.props.status === "active" || this.props.userId != null)
      throw conflict(
        "MEMBER_ALREADY_JOINED",
        "This Team Member has already joined.",
      );
    this.props = {
      ...this.props,
      userId,
      status: "active",
      joinedAt: now,
      inviteToken: null,
    };
    this.touch(by, now);
  }

  /** The invitee declined (CM-109). */
  reject(by: string, now: Date): void {
    if (this.props.status !== "joining_pending")
      throw conflict(
        "JOIN_REQUEST_CLOSED",
        "This Join Request is no longer pending.",
      );
    this.props = { ...this.props, status: "rejected", inviteToken: null };
    this.touch(by, now);
  }

  /** A fresh link, also reopening a rejected request. */
  resendInvite(by: string, now: Date): void {
    if (this.props.status === "active")
      throw conflict(
        "MEMBER_ALREADY_JOINED",
        "This Team Member has already joined.",
      );
    this.props = {
      ...this.props,
      status: "joining_pending",
      inviteToken: newInviteToken(),
      invitedAt: now,
    };
    this.touch(by, now);
  }

  /**
   * Transfer ownership (CM-907): this joined, active, Normal Team Member
   * becomes the Owner, with the Owner Designation (kept when the Company
   * has none) and every right, so no Role. The Owner is on every Project,
   * so the assignments go.
   */
  becomeOwner(ownerDesignationId: string | null, by: string, now: Date): void {
    if (this.props.isOwner)
      throw conflict("ALREADY_OWNER", "This Team Member is already the Owner.");
    if (
      this.props.status !== "active" ||
      this.props.userId == null ||
      this.props.deletedAt != null
    )
      throw conflict(
        "NEW_OWNER_NOT_ACTIVE",
        "Choose an active Team Member who has joined the Company.",
      );
    if (this.props.memberType === "hrms")
      throw conflict(
        "OWNER_IS_NORMAL",
        "The Owner cannot be an HRMS Team Member.",
      );
    this.props = {
      ...this.props,
      isOwner: true,
      roleId: null,
      projectIds: [],
      details: {
        ...this.props.details,
        designationId: ownerDesignationId ?? this.props.details.designationId,
      },
    };
    this.touch(by, now);
  }

  /**
   * The Owner after handing the Company over (CM-907): a member with the
   * Admin Designation (kept when the Company has none) and `roleId`.
   */
  stepDownAsOwner(
    designationId: string | null,
    roleId: string,
    by: string,
    now: Date,
  ): void {
    if (!this.props.isOwner)
      throw conflict("NOT_OWNER", "Only the Owner can hand the Company over.");
    this.props = {
      ...this.props,
      isOwner: false,
      roleId,
      details: {
        ...this.props.details,
        designationId: designationId ?? this.props.details.designationId,
      },
    };
    this.touch(by, now);
  }

  /**
   * The User deleted their account (CM-907). The record stays as the
   * Company's own, marked Left and no longer linked to a User.
   */
  leave(now: Date): void {
    if (this.props.isOwner)
      throw conflict(
        "OWNER_MUST_HAND_OVER",
        "The Owner must hand the Company over or delete it first.",
      );
    const by = this.props.userId ?? this.props.updatedBy;
    this.props = {
      ...this.props,
      userId: null,
      status: "left",
      inviteToken: null,
    };
    this.touch(by, now);
  }

  /** Soft delete (root ADR-0019). The Owner stays. */
  remove(by: string, now: Date): void {
    if (this.props.isOwner)
      throw conflict("OWNER_CANNOT_BE_REMOVED", "The Owner cannot be removed.");
    if (this.props.deletedAt != null)
      throw new DomainError(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was removed.",
        {
          kind: "not_found",
        },
      );
    this.props = { ...this.props, deletedAt: now, inviteToken: null };
    this.touch(by, now);
  }
}
