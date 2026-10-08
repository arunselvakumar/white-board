import { describe, expect, it } from "vitest";

import { PermissionSet } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { Designation } from "./designation";

const NOW = new Date("2026-10-08T00:00:00Z");

function designation(
  name = "Site Engineer",
  template: PermissionSet | null = null,
) {
  return Designation.create({
    id: "d1",
    workspaceId: "company-1",
    name,
    template,
    by: "user-1",
    now: NOW,
  });
}

describe("Designation", () => {
  it("needs a name and tidies its spaces", () => {
    expect(() => designation("   ")).toThrow(DomainError);
    expect(designation("  Site   Engineer ").name).toBe("Site Engineer");
  });

  it("drops an empty template", () => {
    expect(designation("Helper", PermissionSet.empty()).template).toBeNull();
  });

  it("duplicates with the same template and a copy name", () => {
    const template = PermissionSet.fromGrants({
      "labour.attendance": ["create", "read"],
    });
    const copy = designation("Site Engineer", template).duplicate({
      id: "d2",
      by: "user-1",
      now: NOW,
    });
    expect(copy.name).toBe("Site Engineer (copy)");
    expect(copy.isSeed).toBe(false);
    expect(copy.template?.equals(template)).toBe(true);
  });

  it("cannot be deleted twice", () => {
    const item = designation();
    item.delete("user-1", NOW);
    expect(() => {
      item.delete("user-1", NOW);
    }).toThrow(DomainError);
  });
});
