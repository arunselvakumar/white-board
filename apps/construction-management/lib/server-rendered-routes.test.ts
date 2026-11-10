import { describe, expect, it } from "vitest";

import { isServerRendered } from "./server-rendered-routes";

describe("isServerRendered", () => {
  it("matches a listed path exactly", () => {
    expect(isServerRendered("/app/projects")).toBe(true);
    expect(isServerRendered("/app/projects/new")).toBe(false);
    expect(isServerRendered("/app/project")).toBe(false);
  });

  it("matches a dynamic segment against any one segment", () => {
    const routes = ["/x/[id]", "/x/[id]/edit"];
    expect(isServerRendered("/x/123", routes)).toBe(true);
    expect(isServerRendered("/x/123/edit", routes)).toBe(true);
    expect(isServerRendered("/x", routes)).toBe(false);
    expect(isServerRendered("/x/", routes)).toBe(false);
    expect(isServerRendered("/x/123/other", routes)).toBe(false);
  });
});
