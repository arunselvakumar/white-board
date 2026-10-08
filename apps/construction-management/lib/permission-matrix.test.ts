import { describe, expect, it } from "vitest";

import {
  MENUS,
  menuByKey,
  type Menu,
  type MenuKey,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

import {
  byCategory,
  columnState,
  filterMenus,
  grantedCount,
  groupState,
  maskOf,
  setColumn,
  setGroup,
  supportedCount,
  toggleCell,
} from "./permission-matrix";

function menu(key: MenuKey): Menu {
  const found = menuByKey(key);
  if (found == null) throw new Error(key);
  return found;
}

const project = menu("projects.project"); // CRUDF
const wings = menu("projects.wings"); // CRUD
const gallery = menu("projects.gallery"); // R

describe("Permission Matrix helpers", () => {
  it("toggles one cell, keeps flag order and drops empty menus", () => {
    let grants: PermissionGrants = {};
    grants = toggleCell(grants, project, "update", true);
    grants = toggleCell(grants, project, "create", true);
    expect(grants).toEqual({ "projects.project": ["create", "update"] });
    grants = toggleCell(grants, project, "create", false);
    grants = toggleCell(grants, project, "update", false);
    expect(grants).toEqual({});
  });

  it("never grants a cell the menu does not support", () => {
    const grants = toggleCell({}, project, "approve", true);
    expect(grants).toEqual({});
    expect(maskOf({ "projects.project": ["approve", "read"] }, project)).toBe(
      maskOf({ "projects.project": ["read"] }, project),
    );
  });

  it("does not change the value it was given", () => {
    const grants: PermissionGrants = { "projects.wings": ["read"] };
    toggleCell(grants, wings, "create", true);
    setGroup(grants, [wings], false);
    expect(grants).toEqual({ "projects.wings": ["read"] });
  });

  it("selects a column only where the menu supports the flag", () => {
    const menus = [project, wings, gallery];
    const created = setColumn({}, menus, "create", true);
    expect(created).toEqual({
      "projects.project": ["create"],
      "projects.wings": ["create"],
    });
    expect(columnState(created, menus, "create")).toBe("all");
    expect(columnState(created, menus, "read")).toBe("none");
    expect(columnState(created, menus, "approve")).toBeNull();
    expect(columnState({ "projects.gallery": ["read"] }, menus, "read")).toBe(
      "some",
    );
    expect(setColumn(created, menus, "create", false)).toEqual({});
  });

  it("selects and clears a whole category and counts its cells", () => {
    const menus = [project, wings, gallery];
    expect(supportedCount(menus)).toBe(10);
    const all = setGroup({ "hrms.hrms": ["read"] }, menus, true);
    expect(grantedCount(all, menus)).toBe(10);
    expect(groupState(all, menus)).toBe("all");
    expect(all["hrms.hrms"]).toEqual(["read"]);
    const some = toggleCell(all, gallery, "read", false);
    expect(groupState(some, menus)).toBe("some");
    expect(setGroup(all, menus, false)).toEqual({ "hrms.hrms": ["read"] });
    expect(groupState({}, menus)).toBe("none");
  });

  it("filters menus by label, ignoring case", () => {
    expect(filterMenus(MENUS, "  purchase  ").map((m) => m.label)).toEqual(
      expect.arrayContaining(["Purchase Request"]),
    );
    expect(filterMenus(MENUS, "")).toBe(MENUS);
    expect(filterMenus(MENUS, "zzz")).toEqual([]);
  });

  it("groups menus in category order and leaves empty categories out", () => {
    const groups = byCategory(MENUS);
    expect(groups[0]?.label).toBe("Project Management");
    expect(groups.reduce((sum, group) => sum + group.menus.length, 0)).toBe(
      MENUS.length,
    );
    expect(byCategory([gallery]).map((group) => group.key)).toEqual([
      "project_management",
    ]);
  });
});
