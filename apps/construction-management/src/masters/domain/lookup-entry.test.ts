import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { LookupEntry } from "./lookup-entry";
import { cleanMasterName } from "./master-kind";

const NOW = new Date("2026-10-08T06:30:00.000Z");
const LATER = new Date("2026-10-08T07:00:00.000Z");

function entry(isSeed = false) {
  return LookupEntry.create({
    id: "0199a1b2-0000-7000-8000-000000000001",
    kind: "labour_category",
    workspaceId: "ws_1",
    name: "  Bar   Bender ",
    isSeed,
    by: "user_1",
    now: NOW,
  });
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("cleanMasterName", () => {
  it("trims, collapses spaces, and limits to 100 characters", () => {
    expect(cleanMasterName("department", "  Masonry   &  Plaster ")).toBe(
      "Masonry & Plaster",
    );
    expect(codeOf(() => cleanMasterName("department", "   "))).toBe(
      "DEPARTMENT_NAME_REQUIRED",
    );
    expect(codeOf(() => cleanMasterName("supervisor", "x".repeat(101)))).toBe(
      "SUPERVISOR_NAME_TOO_LONG",
    );
    expect(cleanMasterName("labour_category", "x".repeat(100))).toHaveLength(
      100,
    );
  });
});

describe("LookupEntry", () => {
  it("starts enabled with a clean name", () => {
    const made = entry();
    expect(made.name).toBe("Bar Bender");
    expect(made.disabled).toBe(false);
    expect(made.isSeed).toBe(false);
    expect(made.snapshot()).toEqual({
      name: "Bar Bender",
      isSeed: false,
      disabled: false,
    });
  });

  it("renames, disables, enables and deletes a Company row", () => {
    const made = entry();
    made.rename("Steel Fixer", "user_2", LATER);
    expect(made.name).toBe("Steel Fixer");
    expect(made.updatedAt).toEqual(LATER);
    expect(made.updatedBy).toBe("user_2");

    expect(made.disable("user_2", LATER)).toBe(true);
    expect(made.disabled).toBe(true);
    expect(made.disable("user_2", LATER)).toBe(false);
    expect(made.enable("user_2", LATER)).toBe(true);
    expect(made.disabled).toBe(false);
    expect(made.enable("user_2", LATER)).toBe(false);

    made.delete("user_2", LATER);
    expect(made.deletedAt).toEqual(LATER);
    expect(made.deletedBy).toBe("user_2");
    expect(
      codeOf(() => {
        made.rename("Again", "user_2", LATER);
      }),
    ).toBe("LABOUR_CATEGORY_NOT_FOUND");
  });

  it("lets a seed row be disabled and enabled, never renamed or deleted", () => {
    const seed = entry(true);
    expect(
      codeOf(() => {
        seed.rename("Other", "user_1", LATER);
      }),
    ).toBe("SEED_IS_READ_ONLY");
    expect(
      codeOf(() => {
        seed.delete("user_1", LATER);
      }),
    ).toBe("SEED_IS_READ_ONLY");
    expect(seed.disable("user_1", LATER)).toBe(true);
    expect(seed.enable("user_1", LATER)).toBe(true);
    expect(seed.name).toBe("Bar Bender");
  });

  it("refuses a blank rename", () => {
    expect(
      codeOf(() => {
        entry().rename(" ", "user_1", LATER);
      }),
    ).toBe("LABOUR_CATEGORY_NAME_REQUIRED");
  });
});
