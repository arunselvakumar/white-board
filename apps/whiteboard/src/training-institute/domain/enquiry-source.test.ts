import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENQUIRY_SOURCE_NAMES,
  EnquirySource,
  enquirySourceNameKey,
} from "./enquiry-source";

const now = new Date("2026-11-02T04:30:00.000Z");

function add(name = "  School tie-up "): EnquirySource {
  return EnquirySource.add({
    id: "source-1",
    workspaceId: "org_1",
    name,
    userId: "user_owner",
    now,
  });
}

function code(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("EnquirySource", () => {
  it("has the five defaults", () => {
    expect(DEFAULT_ENQUIRY_SOURCE_NAMES).toEqual([
      "Phone call",
      "Walk-in",
      "Referral",
      "Social media",
      "Website",
    ]);
  });

  it("trims names of 1 to 80 characters", () => {
    expect(add().name).toBe("School tie-up");
    expect(add("x".repeat(80)).name).toHaveLength(80);
    expect(code(() => add("   "))).toBe("ENQUIRY_SOURCE_NAME_INVALID");
    expect(code(() => add("x".repeat(81)))).toBe("ENQUIRY_SOURCE_NAME_INVALID");
  });

  it("compares names ignoring case and surrounding spaces", () => {
    expect(enquirySourceNameKey(" Walk-In ")).toBe(
      enquirySourceNameKey("walk-in"),
    );
  });

  it("renames, retires, and restores", () => {
    const source = add();
    source.rename(" Schools ", now);
    expect(source.name).toBe("Schools");
    source.retire({ userId: "user_owner", now });
    expect(source.retired).toBe(true);
    expect(
      code(() => {
        source.retire({ userId: "user_owner", now });
      }),
    ).toBe("ENQUIRY_SOURCE_ALREADY_RETIRED");
    expect(
      code(() => {
        source.assertSelectable();
      }),
    ).toBe("ENQUIRY_SOURCE_RETIRED");
    source.restore(now);
    expect(source.retired).toBe(false);
    expect(
      code(() => {
        source.restore(now);
      }),
    ).toBe("ENQUIRY_SOURCE_NOT_RETIRED");
    expect(() => {
      source.assertSelectable();
    }).not.toThrow();
  });
});
