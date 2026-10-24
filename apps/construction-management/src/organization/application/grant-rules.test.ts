import { describe, expect, it } from "vitest";

import { PermissionSet, type MemberAccess } from "@/src/shared-kernel/access";

import { assertCanGrant, assertNotOwnRole } from "./grant-rules";

const hr: MemberAccess = {
  workspaceId: "c1",
  userId: "hr",
  role: "member",
  roleId: "role-hr",
  permissions: PermissionSet.fromGrants({
    "organization.team_members": ["create", "read", "update"],
    "labour.attendance": ["create", "read"],
  }),
  projectIds: new Set(),
};

describe("assertCanGrant", () => {
  it("lets the Owner grant anything", () => {
    expect(() => {
      assertCanGrant({ ...hr, role: "owner" }, PermissionSet.everything());
    }).not.toThrow();
  });

  it("lets a Member grant a subset of their own cells", () => {
    expect(() => {
      assertCanGrant(
        hr,
        PermissionSet.fromGrants({ "labour.attendance": ["read"] }),
      );
    }).not.toThrow();
  });

  it("refuses cells the Member does not hold", () => {
    expect(() => {
      assertCanGrant(
        hr,
        PermissionSet.fromGrants({ "labour.attendance": ["delete"] }),
      );
    }).toThrow(expect.objectContaining({ code: "CANNOT_GRANT" }) as Error);
  });
});

describe("assertNotOwnRole", () => {
  it("refuses the Role the Member is on, and their own Team Member", () => {
    for (const target of [{ roleId: "role-hr" }, { userId: "hr" }])
      expect(() => {
        assertNotOwnRole(hr, target);
      }).toThrow(expect.objectContaining({ code: "OWN_ROLE" }) as Error);
  });

  it("allows another Role, and the Owner anything", () => {
    expect(() => {
      assertNotOwnRole(hr, { roleId: "role-site", userId: "someone" });
      assertNotOwnRole({ ...hr, role: "owner" }, { roleId: "role-hr" });
    }).not.toThrow();
  });
});
