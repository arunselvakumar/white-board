import { describe, expect, it } from "vitest";

import {
  USERS_ROLES_SECTIONS,
  activeUsersRolesSection,
  rolePath,
  userPath,
} from "./users-roles-nav";

describe("USERS_ROLES_SECTIONS", () => {
  it("has Users, then Role Management", () => {
    expect(USERS_ROLES_SECTIONS.map((section) => section.label)).toEqual([
      "Users",
      "Role Management",
    ]);
    expect(USERS_ROLES_SECTIONS.map((section) => section.href)).toEqual([
      "/app/users",
      "/app/roles",
    ]);
  });

  it("finds the section a page belongs to", () => {
    expect(activeUsersRolesSection("/app/users")?.label).toBe("Users");
    expect(activeUsersRolesSection("/app/users/new")?.label).toBe("Users");
    expect(activeUsersRolesSection(userPath("u1"))?.label).toBe("Users");
    expect(activeUsersRolesSection(rolePath("r1"))?.label).toBe(
      "Role Management",
    );
    expect(activeUsersRolesSection("/app/usersx")).toBeUndefined();
    expect(activeUsersRolesSection("/app/masters")).toBeUndefined();
  });
});
