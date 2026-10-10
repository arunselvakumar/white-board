import { describe, expect, it } from "vitest";

import { homePathFor } from "./home-path";

describe("homePathFor (CM-318)", () => {
  it("lands an HRMS Team Member on Workspace → HRMS", () => {
    expect(homePathFor("hrms")).toBe("/app/workspace/hrms");
  });

  it("lands everyone else on the Projects home", () => {
    expect(homePathFor("normal")).toBe("/app/projects");
    expect(homePathFor(null)).toBe("/app/projects");
  });
});
