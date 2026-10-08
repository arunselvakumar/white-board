import { describe, expect, it } from "vitest";

import { PermissionSet } from "@/src/shared-kernel/access";

import { Designation } from "./designation";
import { applyTemplate } from "./starting-permissions";

const template = PermissionSet.fromGrants({
  "procurement.purchase_requests": ["create", "read"],
});

const engineer = Designation.create({
  id: "d1",
  workspaceId: "c1",
  name: "Site Engineer",
  template,
  by: "u1",
  now: new Date(),
});

describe("applyTemplate", () => {
  it("copies the Designation's template for a Normal Team Member", () => {
    const applied = applyTemplate(engineer, "normal");
    expect(applied.equals(template)).toBe(true);
  });

  it("starts empty without a template", () => {
    expect(applyTemplate(null, "normal").size).toBe(0);
  });

  it("uses the HRMS default set for an HRMS Team Member, whatever the Designation", () => {
    const applied = applyTemplate(engineer, "hrms");
    expect(applied.has("procurement.purchase_requests", "create")).toBe(false);
    expect(applied.has("hrms.leaves", "create")).toBe(true);
  });
});
