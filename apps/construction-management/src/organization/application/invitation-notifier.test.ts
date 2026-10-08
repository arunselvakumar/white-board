import { describe, expect, it } from "vitest";

import { PermissionSet } from "@/src/shared-kernel/access";

import type { DesignationRepository } from "../domain/designation-repository";
import { TeamMember, teamMemberDetails } from "../domain/team-member";
import type { TeamMemberRepository } from "../domain/team-member-repository";
import type { CompanyProfileReader } from "./company-profile-reader";
import {
  InvitationNotifier,
  type InvitationChannels,
} from "./invitation-notifier";
import type { TeamMemberInvited } from "./team-member-handlers";

const NOW = new Date("2026-10-08T06:30:00Z");

function setup(contact: { mobile?: string; email?: string }) {
  const member = TeamMember.invite({
    id: "member-1",
    workspaceId: "company-a",
    details: teamMemberDetails({
      name: "Suresh Kale",
      designationId: "designation-1",
      ...contact,
    }),
    memberType: "normal",
    permissions: PermissionSet.empty(),
    by: "owner",
    now: NOW,
  });
  const members = {
    findById: (workspaceId: string, id: string) =>
      Promise.resolve(
        workspaceId === member.workspaceId && id === member.id ? member : null,
      ),
  } as Partial<TeamMemberRepository> as TeamMemberRepository;
  const designations = {
    findById: () => Promise.resolve(null),
  } as Partial<DesignationRepository> as DesignationRepository;
  const profiles: CompanyProfileReader = {
    findByWorkspace: () => Promise.resolve(null),
  };
  const sent: { channel: "email" | "sms"; to: string; link: string }[] = [];
  const channels: InvitationChannels = {
    email: (to, message) => {
      sent.push({ channel: "email", to, link: message.link });
      return Promise.resolve();
    },
    sms: (to, message) => {
      sent.push({ channel: "sms", to, link: message.link });
      return Promise.resolve();
    },
  };
  const invited: TeamMemberInvited = {
    type: "TeamMemberInvited",
    workspaceId: member.workspaceId,
    memberId: member.id,
    occurredAt: NOW,
  };
  const notify = (smsEnabled?: () => boolean) =>
    new InvitationNotifier(
      members,
      designations,
      profiles,
      channels,
      () => "https://cm.example.test",
      smsEnabled,
    ).handle(invited);
  return { member, sent, notify };
}

describe("InvitationNotifier", () => {
  it("sends only the email while SMS is off (the default)", async () => {
    const { member, sent, notify } = setup({
      mobile: "+919876543210",
      email: "suresh@kale.in",
    });
    await notify();
    expect(sent).toEqual([
      {
        channel: "email",
        to: "suresh@kale.in",
        link: `https://cm.example.test/join/${member.inviteToken ?? ""}`,
      },
    ]);
  });

  it("sends nothing to a member with only a mobile while SMS is off", async () => {
    const { sent, notify } = setup({ mobile: "+919876543210" });
    await notify(() => false);
    expect(sent).toEqual([]);
  });

  it("also texts the mobile while SMS is on", async () => {
    const { sent, notify } = setup({
      mobile: "+919876543210",
      email: "suresh@kale.in",
    });
    await notify(() => true);
    expect(sent.map(({ channel, to }) => ({ channel, to }))).toEqual([
      { channel: "email", to: "suresh@kale.in" },
      { channel: "sms", to: "+919876543210" },
    ]);
  });
});
