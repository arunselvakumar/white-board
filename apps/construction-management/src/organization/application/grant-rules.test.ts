import { describe, expect, it } from "vitest";

import { PermissionSet, type MemberAccess } from "@/src/shared-kernel/access";

import { assertCanGrant } from "./grant-rules";

const hr: MemberAccess = {
  workspaceId: "c1",
  userId: "hr",
  role: "member",
  permissions: PermissionSet.fromGrants({
    "organization.team_members": ["create", "read", "update"],
    "labour.attendance": ["create", "read"],
  }),
  projectIds: new Set(),
};

describe("assertCanGrant", () => {
  it("lets the Owner grant anything", () => {
    expect(() => {
      assertCanGrant({ ...hr, role: "owner" }, PermissionSet.everything(), {
        userId: "x",
      });
    }).not.toThrow();
  });

  it("lets a Member grant a subset of their own cells", () => {
    expect(() => {
      assertCanGrant(
        hr,
        PermissionSet.fromGrants({ "labour.attendance": ["read"] }),
        { userId: null },
      );
    }).not.toThrow();
  });

  it("refuses cells the Member does not hold", () => {
    expect(() => {
      assertCanGrant(
        hr,
        PermissionSet.fromGrants({ "labour.attendance": ["delete"] }),
        { userId: null },
      );
    }).toThrow(
      expect.objectContaining({
        code: "CANNOT_GRANT_MORE_THAN_YOU_HAVE",
      }) as Error,
    );
  });

  it("refuses a Member's own matrix", () => {
    expect(() => {
      assertCanGrant(hr, PermissionSet.empty(), { userId: "hr" });
    }).toThrow(
      expect.objectContaining({
        code: "CANNOT_CHANGE_OWN_PERMISSIONS",
      }) as Error,
    );
  });
});
