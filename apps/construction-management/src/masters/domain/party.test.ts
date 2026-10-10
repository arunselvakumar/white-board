import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { Party, partyDetails, type PartyKind } from "./party";

const NOW = new Date("2026-10-10T06:30:00.000Z");
const LATER = new Date("2026-10-10T07:00:00.000Z");
const PROJECT = "0199a1b2-0000-7000-8000-0000000000p1";
const OTHER = "0199a1b2-0000-7000-8000-0000000000p2";
const RCC = "0199a1b2-0000-7000-8000-0000000000d1";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

function party(kind: PartyKind = "contractor") {
  return Party.create({
    id: "0199a1b2-0000-7000-8000-000000000010",
    workspaceId: "ws_1",
    kind,
    details: {
      name: "  Sri  Balaji Constructions ",
      contactPerson: "Murugan",
      mobile: "77081 65767",
      email: "Office@Balaji.example",
      gstin: "33aapfa0939f1zm",
      pan: "aapfa0939f",
    },
    departmentIds: [RCC, RCC],
    projectIds: [PROJECT],
    by: "user_1",
    now: NOW,
  });
}

describe("partyDetails", () => {
  it("tidies the name and normalises mobile, email, GSTIN and PAN", () => {
    expect(party().snapshot()).toMatchObject({
      name: "Sri Balaji Constructions",
      contactPerson: "Murugan",
      mobile: "+917708165767",
      email: "office@balaji.example",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      isActive: true,
      departmentIds: [RCC],
      projectIds: [PROJECT],
    });
  });

  it("names its errors after the kind", () => {
    expect(codeOf(() => partyDetails("contractor", { name: " " }))).toBe(
      "CONTRACTOR_NAME_REQUIRED",
    );
    expect(
      codeOf(() => partyDetails("supplier", { name: "x".repeat(121) })),
    ).toBe("SUPPLIER_NAME_TOO_LONG");
  });

  it("refuses a bad mobile, email, GSTIN, PAN or a GSTIN without the PAN", () => {
    const name = "Kaveri Cements";
    expect(
      codeOf(() => partyDetails("supplier", { name, mobile: "123" })),
    ).toBe("MOBILE_INVALID");
    expect(codeOf(() => partyDetails("supplier", { name, email: "a@b" }))).toBe(
      "EMAIL_INVALID",
    );
    expect(
      codeOf(() =>
        partyDetails("supplier", { name, gstin: "33AAPFA0939F1ZD" }),
      ),
    ).toBe("GSTIN_INVALID");
    expect(
      codeOf(() => partyDetails("supplier", { name, pan: "AAPF0939F" })),
    ).toBe("PAN_INVALID");
    expect(
      codeOf(() =>
        partyDetails("supplier", {
          name,
          gstin: "33AAPFA0939F1ZM",
          pan: "AAACB1234C",
        }),
      ),
    ).toBe("GSTIN_PAN_MISMATCH");
    expect(
      codeOf(() =>
        partyDetails("supplier", { name, address: "x".repeat(501) }),
      ),
    ).toBe("ADDRESS_TOO_LONG");
  });
});

describe("Party", () => {
  it("keeps Departments only for a Contractor", () => {
    expect(party("supplier").departmentIds).toEqual([]);
  });

  it("joins and leaves a Project, touching updatedAt", () => {
    const made = party();
    made.joinProject(OTHER, "user_2", LATER);
    expect(made.projectIds).toEqual([PROJECT, OTHER]);
    expect(made.updatedAt).toEqual(LATER);
    made.leaveProject(PROJECT, "user_2", LATER);
    expect(made.projectIds).toEqual([OTHER]);
  });

  it("keeps an inactive party on its Projects but adds it to no other", () => {
    const made = party();
    expect(made.setActive(false, "user_1", LATER)).toBe(true);
    expect(made.setActive(false, "user_1", LATER)).toBe(false);
    expect(made.projectIds).toEqual([PROJECT]);
    expect(
      codeOf(() => {
        made.joinProject(PROJECT, "user_1", LATER);
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        made.joinProject(OTHER, "user_1", LATER);
      }),
    ).toBe("CONTRACTOR_INACTIVE");
  });

  it("is not found once deleted", () => {
    const made = party();
    made.delete("user_1", LATER);
    expect(made.deletedAt).toEqual(LATER);
    expect(codeOf(() => made.setActive(false, "user_1", LATER))).toBe(
      "CONTRACTOR_NOT_FOUND",
    );
  });
});
