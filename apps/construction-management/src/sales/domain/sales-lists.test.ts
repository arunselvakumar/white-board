import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { movedStageOrder, salesListName } from "./sales-lists";

describe("sales lists (CM-1002)", () => {
  it("moves a stage one place, and not past either end", () => {
    const order = ["a", "b", "c"];
    expect(movedStageOrder(order, "b", "up")).toEqual(["b", "a", "c"]);
    expect(movedStageOrder(order, "b", "down")).toEqual(["a", "c", "b"]);
    expect(movedStageOrder(order, "a", "up")).toBeNull();
    expect(movedStageOrder(order, "c", "down")).toBeNull();
    expect(movedStageOrder(order, "x", "up")).toBeNull();
  });

  it("trims names and refuses empty or long ones", () => {
    expect(salesListName("lead_source", "  Walk   in ")).toBe("Walk in");
    const code = (raw: string) => {
      try {
        salesListName("funnel_stage", raw);
        return null;
      } catch (error) {
        return error instanceof DomainError ? error.code : "other";
      }
    };
    expect(code(" ")).toBe("FUNNEL_STAGE_NAME_REQUIRED");
    expect(code("x".repeat(61))).toBe("FUNNEL_STAGE_NAME_TOO_LONG");
    expect(code("x".repeat(60))).toBeNull();
  });
});
