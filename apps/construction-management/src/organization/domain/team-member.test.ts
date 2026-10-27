import { describe, expect, it } from "vitest";

import { NO_SALARY, staffSalary } from "./staff-salary";
import { TeamMember, teamMemberDetails } from "./team-member";

const NOW = new Date("2026-10-08T00:00:00Z");

const details = teamMemberDetails({
  name: " Prabhu  Saravanan ",
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
    roleId: memberType === "hrms" ? "role-hrms" : "role-site",
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
    expect(() => teamMemberDetails({ name: "A" })).toThrow(
      expect.objectContaining({
        code: "MOBILE_OR_EMAIL_REQUIRED",
        message: "Enter an email to invite them, or at least a mobile number.",
      }) as Error,
    );
    expect(teamMemberDetails({ name: "A", email: "a@b.in" }).email).toBe(
      "a@b.in",
    );
  });

  it("rejects a wrong Aadhaar or PAN", () => {
    expect(() =>
      teamMemberDetails({
        name: "A",
        mobile: "+917708165767",
        aadhaar: "234123412345",
      }),
    ).toThrow(expect.objectContaining({ code: "AADHAAR_INVALID" }) as Error);
    expect(() =>
      teamMemberDetails({
        name: "A",
        mobile: "+917708165767",
        pan: "ABCXE1234F",
      }),
    ).toThrow(expect.objectContaining({ code: "PAN_INVALID" }) as Error);
  });
});

describe("salary (ADR CM-0033 §3)", () => {
  it("is set on Add Staff and changed or cleared later", () => {
    const salary = staffSalary({ perMonth: 2_500_000 });
    const member = TeamMember.invite({
      id: "member-1",
      workspaceId: "company-1",
      details,
      salary,
      memberType: "normal",
      roleId: "role-site",
      by: "owner",
      now: NOW,
    });
    expect(member.salary).toEqual(salary);
    expect(invite().salary).toEqual(NO_SALARY);
    const later = new Date("2026-10-09T00:00:00Z");
    const daily = staffSalary({ type: "daily", perDay: 90_000 });
    member.setSalary(daily, "accountant", later);
    expect(member).toMatchObject({
      salary: daily,
      updatedBy: "accountant",
      updatedAt: later,
    });
    member.setSalary(NO_SALARY, "accountant", later);
    expect(member.salary.perDay).toBeNull();
  });

  it("leaves the record untouched when nothing changed", () => {
    const member = invite();
    member.setSalary(staffSalary({}), "accountant", new Date("2026-10-09"));
    expect(member.updatedBy).toBe("owner");
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
    normal.changeType("hrms", "owner", NOW);
    expect(normal.projectIds).toEqual([]);
    expect(normal.roleId).toBe("role-site");
  });

  it("never removes the Owner or gives them a Role", () => {
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
      owner.setRole("role-site", "user-1", NOW);
    }).toThrow(expect.objectContaining({ code: "OWNER_HAS_NO_ROLE" }) as Error);
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

describe("ownership and leaving (CM-907)", () => {
  function joined(memberType: "normal" | "hrms" = "normal") {
    const member = invite(memberType);
    member.accept("user-2", NOW);
    return member;
  }

  function owner() {
    return TeamMember.owner({
      id: "owner-member",
      workspaceId: "company-1",
      userId: "owner",
      details,
      now: NOW,
    });
  }

  it("makes a joined Normal member the Owner with every right", () => {
    const member = joined();
    member.assignToProjects(["project-1"], "owner", NOW);
    member.becomeOwner("owner", NOW);
    expect(member).toMatchObject({
      isOwner: true,
      projectIds: [],
      roleId: null,
    });
  });

  it("refuses a member who has not joined, an HRMS member and the Owner", () => {
    expect(() => {
      invite().becomeOwner("owner", NOW);
    }).toThrow(
      expect.objectContaining({ code: "NEW_OWNER_NOT_ACTIVE" }) as Error,
    );
    expect(() => {
      joined("hrms").becomeOwner("owner", NOW);
    }).toThrow(expect.objectContaining({ code: "OWNER_IS_NORMAL" }) as Error);
    expect(() => {
      owner().becomeOwner("owner", NOW);
    }).toThrow(expect.objectContaining({ code: "ALREADY_OWNER" }) as Error);
  });

  it("makes the old Owner a member on the given Role", () => {
    const old = owner();
    old.stepDownAsOwner("role-admin", "owner", NOW);
    expect(old.isOwner).toBe(false);
    expect(old.roleId).toBe("role-admin");
    expect(() => {
      old.stepDownAsOwner("role-admin", "owner", NOW);
    }).toThrow(expect.objectContaining({ code: "NOT_OWNER" }) as Error);
  });

  it("goes Active with the account an admin made, once", () => {
    const member = invite();
    member.setRole("role-store", "owner", NOW);
    member.linkAccount("user-9", "owner", NOW);
    expect(member).toMatchObject({
      status: "active",
      userId: "user-9",
      inviteToken: null,
      joinedAt: NOW,
      roleId: "role-store",
    });
    expect(() => {
      member.linkAccount("user-10", "owner", NOW);
    }).toThrow(
      expect.objectContaining({ code: "MEMBER_ALREADY_JOINED" }) as Error,
    );
  });

  it("leaves: the record stays, Left and unlinked; the Owner cannot", () => {
    const member = joined();
    member.leave(NOW);
    expect(member).toMatchObject({
      status: "left",
      userId: null,
      inviteToken: null,
      deletedAt: null,
      updatedBy: "user-2",
    });
    expect(() => {
      owner().leave(NOW);
    }).toThrow(
      expect.objectContaining({ code: "OWNER_MUST_HAND_OVER" }) as Error,
    );
  });
});
