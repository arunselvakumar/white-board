import { describe, expect, it } from "vitest";

import {
  centreIdFromCookieHeader,
  pickActiveCentre,
} from "./preschool-active-centre";

const centres = [
  { id: "a", status: "closed" },
  { id: "b", status: "active" },
  { id: "c", status: "active" },
];

describe("centreIdFromCookieHeader", () => {
  it("reads the Centre cookie among others", () => {
    expect(
      centreIdFromCookieHeader("theme=dark; wb_preschool_centre=c%2D1; x=y"),
    ).toBe("c-1");
    expect(centreIdFromCookieHeader("theme=dark")).toBeNull();
    expect(centreIdFromCookieHeader("wb_preschool_centre=")).toBeNull();
    expect(centreIdFromCookieHeader(null)).toBeNull();
  });
});

describe("pickActiveCentre", () => {
  it("keeps the remembered Centre while the User may open it", () => {
    expect(pickActiveCentre(centres, "c")?.id).toBe("c");
    expect(pickActiveCentre(centres, "a")?.id).toBe("a");
  });

  it("falls back to the first open Centre", () => {
    expect(pickActiveCentre(centres, "gone")?.id).toBe("b");
    expect(pickActiveCentre(centres, null)?.id).toBe("b");
    expect(pickActiveCentre([{ id: "a", status: "closed" }], null)?.id).toBe(
      "a",
    );
    expect(pickActiveCentre([], "a")).toBeNull();
  });
});
