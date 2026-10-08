import type { AuditEvent } from "@/src/shared-kernel/audit";
import { notFound } from "@/src/shared-kernel/domain-error";

import type { TeamMember } from "../domain/team-member";
import type { TeamMemberRepository } from "../domain/team-member-repository";
import type { CompanyMemberships } from "./company-memberships";
import type { CompanyProfileReader } from "./company-profile-reader";

/** The signed-in User, by what they have verified (ADR CM-0002). */
export type Joiner = {
  userId: string;
  /** Verified mobile, E.164. */
  mobile: string | null;
  /** Verified email (never a placeholder). */
  email: string | null;
};

export type JoinRequestView = {
  id: string;
  companyId: string;
  companyName: string;
  memberName: string;
  invitedAt: Date | null;
};

export type JoinLinkPreview = {
  id: string;
  companyName: string;
  memberName: string;
  /** Who the request is for, masked: `+91 ••••• 43210` or `r••••@patil.in`. */
  contacts: { kind: "mobile" | "email"; masked: string }[];
};

export function maskMobile(mobile: string): string {
  return `${mobile.slice(0, 3)} ••••• ${mobile.slice(-5)}`;
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}••••@${domain}`;
}

/**
 * Join Requests (CM-109): a pending Team Member whose mobile or email matches
 * what the signed-in User verified. Accepting adds the `member` membership
 * and links the record; rejecting closes it.
 */
export class JoinRequestHandlers {
  constructor(
    private readonly members: TeamMemberRepository,
    private readonly memberships: CompanyMemberships,
    private readonly profiles: CompanyProfileReader,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async companyName(workspaceId: string): Promise<string> {
    return (
      (await this.profiles.findByWorkspace(workspaceId))?.name ?? "A Company"
    );
  }

  private async pendingFor(joiner: Joiner, id: string): Promise<TeamMember> {
    const pending = await this.members.findPendingFor(joiner);
    const member = pending.find((candidate) => candidate.id === id);
    if (member == null)
      throw notFound(
        "JOIN_REQUEST_NOT_FOUND",
        "This Join Request is not for you, or it is no longer pending.",
      );
    return member;
  }

  private audit(member: TeamMember, by: string, action: string): AuditEvent {
    return {
      workspaceId: member.workspaceId,
      actorUserId: by,
      action,
      entityType: "team_member",
      entityId: member.id,
      after: { status: member.status, userId: member.userId },
    };
  }

  async listFor(joiner: Joiner): Promise<JoinRequestView[]> {
    const pending = await this.members.findPendingFor(joiner);
    return Promise.all(
      pending.map(async (member) => ({
        id: member.id,
        companyId: member.workspaceId,
        companyName: await this.companyName(member.workspaceId),
        memberName: member.details.name,
        invitedAt: member.invitedAt,
      })),
    );
  }

  async accept(joiner: Joiner, id: string): Promise<{ companyId: string }> {
    const member = await this.pendingFor(joiner, id);
    member.accept(joiner.userId, this.clock());
    await this.memberships.addMember({
      workspaceId: member.workspaceId,
      userId: joiner.userId,
    });
    try {
      await this.members.save(
        member,
        this.audit(member, joiner.userId, "team_member.joined"),
      );
    } catch (error) {
      await this.memberships.removeMember({
        workspaceId: member.workspaceId,
        userId: joiner.userId,
      });
      throw error;
    }
    return { companyId: member.workspaceId };
  }

  async reject(joiner: Joiner, id: string): Promise<void> {
    const member = await this.pendingFor(joiner, id);
    member.reject(joiner.userId, this.clock());
    await this.members.save(
      member,
      this.audit(member, joiner.userId, "team_member.join_rejected"),
    );
  }

  /** What `/join/<token>` shows before anyone signs in. */
  async preview(token: string): Promise<JoinLinkPreview> {
    const member = await this.members.findByInviteToken(token);
    if (member?.status !== "joining_pending")
      throw notFound(
        "JOIN_LINK_NOT_FOUND",
        "This invite link is no longer valid. Ask for a new one.",
      );
    const contacts: JoinLinkPreview["contacts"] = [];
    if (member.details.mobile != null)
      contacts.push({
        kind: "mobile",
        masked: maskMobile(member.details.mobile),
      });
    if (member.details.email != null)
      contacts.push({ kind: "email", masked: maskEmail(member.details.email) });
    return {
      id: member.id,
      companyName: await this.companyName(member.workspaceId),
      memberName: member.details.name,
      contacts,
    };
  }
}
