import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";

import type { DesignationRepository } from "../domain/designation-repository";
import type { TeamMemberRepository } from "../domain/team-member-repository";
import type { CompanyProfileReader } from "./company-profile-reader";
import type { TeamMemberInvited } from "./team-member-handlers";

export type InvitationMessage = {
  companyName: string;
  memberName: string;
  designationName: string | null;
  link: string;
};

/** Sends the invitation by email and SMS (transports live in `@repo/auth`). */
export type InvitationChannels = {
  email(to: string, message: InvitationMessage): Promise<void>;
  sms(to: string, message: InvitationMessage): Promise<void>;
};

function isInvited(event: DomainEvent): event is TeamMemberInvited {
  return event.type === "TeamMemberInvited";
}

/**
 * Tells a new Team Member about their Join Request (CM-109). The Owner can
 * always share the link themselves; a failed send never undoes the invite.
 */
export class InvitationNotifier implements DomainEventListener {
  constructor(
    private readonly members: TeamMemberRepository,
    private readonly designations: DesignationRepository,
    private readonly profiles: CompanyProfileReader,
    private readonly channels: InvitationChannels,
    private readonly origin: () => string,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!isInvited(event)) return;
    const member = await this.members.findById(
      event.workspaceId,
      event.memberId,
    );
    if (member?.status !== "joining_pending" || member.inviteToken == null)
      return;
    const [profile, designation] = await Promise.all([
      this.profiles.findByWorkspace(member.workspaceId),
      this.designations.findById(
        member.workspaceId,
        member.details.designationId,
      ),
    ]);
    const message: InvitationMessage = {
      companyName: profile?.name ?? "your Company",
      memberName: member.details.name,
      designationName: designation?.name ?? null,
      link: `${this.origin()}/join/${member.inviteToken}`,
    };
    const sends: Promise<void>[] = [];
    if (member.details.email != null)
      sends.push(this.channels.email(member.details.email, message));
    if (member.details.mobile != null)
      sends.push(this.channels.sms(member.details.mobile, message));
    const results = await Promise.allSettled(sends);
    for (const result of results)
      if (result.status === "rejected")
        console.error("Invitation could not be sent", result.reason);
  }
}
