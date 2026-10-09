import { describe, expect, it } from "vitest";

import { PermissionSet } from "@/src/shared-kernel/access";

import { hrmsDefaultPermissions } from "@/src/shared-kernel/access";
import { TeamMember, teamMemberDetails } from "./team-member";

const NOW = new Date("2026-10-08T00:00:00Z");

const details = teamMemberDetails({
  name: " Prabhu  Saravanan ",
  designationId: "designation-1",
  mobile: "+917708165767",
  aadhaar: "2341 2341 2346",
  pan: "abcpe1234f",
});

function invite(memberType: "normal" | "hrms" = "normal") {
  return TeamMember.invite({
    id: "member-1",
    workspaceId: "company-1",
    details,
    memberType,
    permissions:
      memberType === "hrms" ? hrmsDefaultPermissions() : PermissionSet.empty(),
    by: "owner",
    now: NOW,
  });
}

describe("teamMemberDetails", () => {
  it("tidies and validates", () => {
    expect(details).toMatchObject({
      name: "Prabhu Saravanan",
      aadhaar: "234123412346",
      pan: "ABCPE1234F",
      email: null,
    });
  });

  it("needs a mobile or an email", () => {
    expect(() => teamMemberDetails({ name: "A", designationId: "d" })).toThrow(
      expect.objectContaining({
        code: "MOBILE_OR_EMAIL_REQUIRED",
        message: "Enter an email to invite them, or at least a mobile number.",
      }) as Error,
    );
    expect(
      teamMemberDetails({ name: "A", designationId: "d", email: "a@b.in" })
        .email,
    ).toBe("a@b.in");
  });

  it("rejects a wrong Aadhaar or PAN", () => {
    expect(() =>
      teamMemberDetails({
        name: "A",
        designationId: "d",
        mobile: "+917708165767",
        aadhaar: "234123412345",
      }),
    ).toThrow(expect.objectContaining({ code: "AADHAAR_INVALID" }) as Error);
    expect(() =>
      teamMemberDetails({
        name: "A",
        designationId: "d",
        mobile: "+917708165767",
        pan: "ABCXE1234F",
      }),
    ).toThrow(expect.objectContaining({ code: "PAN_INVALID" }) as Error);
  });
});

describe("TeamMember", () => {
  it("starts Joining Pending with an invite token", () => {
    const member = invite();
    expect(member.status).toBe("joining_pending");
    expect(member.inviteToken).toMatch(/^[\w-]{32}$/);
    expect(member.userId).toBeNull();
  });

  it("joins once, and a closed request cannot be accepted", () => {
    const member = invite();
    member.accept("user-9", NOW);
    expect(member).toMatchObject({
      status: "active",
      userId: "user-9",
      inviteToken: null,
    });
    expect(() => {
      member.accept("user-9", NOW);
    }).toThrow(
      expect.objectContaining({ code: "JOIN_REQUEST_CLOSED" }) as Error,
    );
  });

  it("reopens a rejected request with a new link", () => {
    const member = invite();
    member.reject("user-9", NOW);
    expect(member.status).toBe("rejected");
    member.resendInvite("owner", NOW);
    expect(member.status).toBe("joining_pending");
    expect(member.inviteToken).not.toBeNull();
  });

  it("keeps HRMS members off Projects", () => {
    const member = invite("hrms");
    expect(() => {
      member.assignToProjects(["project-1"], "owner", NOW);
    }).toThrow(
      expect.objectContaining({ code: "HRMS_MEMBER_HAS_NO_PROJECTS" }) as Error,
    );
    const normal = invite();
    normal.assignToProjects(["p1", "p1", " p2 "], "owner", NOW);
    expect(normal.projectIds).toEqual(["p1", "p2"]);
    normal.changeType("hrms", hrmsDefaultPermissions(), "owner", NOW);
    expect(normal.projectIds).toEqual([]);
  });

  it("never removes the Owner or edits their matrix", () => {
    const owner = TeamMember.owner({
      id: "member-0",
      workspaceId: "company-1",
      userId: "user-1",
      details,
      now: NOW,
    });
    expect(() => {
      owner.remove("user-1", NOW);
    }).toThrow(
      expect.objectContaining({ code: "OWNER_CANNOT_BE_REMOVED" }) as Error,
    );
    expect(() => {
      owner.setPermissions(PermissionSet.empty(), "user-1", NOW);
    }).toThrow(
      expect.objectContaining({ code: "OWNER_PERMISSIONS_FIXED" }) as Error,
    );
  });

  it("locks a joined member's mobile while it is a way to sign in", () => {
    const member = invite();
    member.accept("user-9", NOW);
    expect(() => {
      member.updateDetails(
        { ...details, mobile: "+919812345678" },
        "owner",
        NOW,
      );
    }).toThrow(expect.objectContaining({ code: "MOBILE_LOCKED" }) as Error);
    expect(() => {
      member.updateDetails(
        { ...details, mobile: "+919812345678" },
        "owner",
        NOW,
        { mobileIsSignIn: true },
      );
    }).toThrow(expect.objectContaining({ code: "MOBILE_LOCKED" }) as Error);
  });

  it("lets a joined member's mobile change while SMS is off", () => {
    const member = invite();
    member.accept("user-9", NOW);
    member.updateDetails(
      { ...details, mobile: "+919812345678" },
      "owner",
      NOW,
      { mobileIsSignIn: false },
    );
    expect(member.details.mobile).toBe("+919812345678");
  });
});
