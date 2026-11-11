import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { Supervisor } from "./supervisor";

const NOW = new Date("2026-10-08T06:30:00.000Z");
const LATER = new Date("2026-10-08T07:00:00.000Z");

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

function supervisor(
  input: { mobile?: string | null; teamMemberId?: string | null } = {},
) {
  return Supervisor.create({
    id: "0199a1b2-0000-7000-8000-000000000010",
    workspaceId: "ws_1",
    name: " Rakesh  Mirtha ",
    by: "user_1",
    now: NOW,
    ...input,
  });
}

describe("Supervisor", () => {
  it("keeps a name, an E.164 mobile and an optional Team Member", () => {
    const made = supervisor({
      mobile: "77081 65767",
      teamMemberId: "0199a1b2-0000-7000-8000-0000000000aa",
    });
    expect(made.snapshot()).toMatchObject({
      name: "Rakesh Mirtha",
      mobile: "+917708165767",
      teamMemberId: "0199a1b2-0000-7000-8000-0000000000aa",
      disabled: false,
    });
    const bare = supervisor({ mobile: "  ", teamMemberId: "" });
    expect(bare.mobile).toBeNull();
    expect(bare.teamMemberId).toBeNull();
  });

  it("keeps a profile and bank details, never the full account number in the snapshot", () => {
    const made = Supervisor.create({
      id: "0199a1b2-0000-7000-8000-000000000011",
      workspaceId: "ws_1",
      name: "Karthik",
      profile: { employeeCode: " SE-1 ", bloodGroup: "o+", experienceYears: 4 },
      bank: { accountNumber: "5010 0123 4567", ifsc: "sbin0000123" },
      by: "user_1",
      now: NOW,
    });
    expect(made.profile).toMatchObject({
      employeeCode: "SE-1",
      bloodGroup: "O+",
      experienceYears: 4,
    });
    expect(made.bank).toMatchObject({
      accountNumber: "501001234567",
      ifsc: "SBIN0000123",
    });
    const snapshot = JSON.stringify(made.snapshot());
    expect(snapshot).not.toContain("501001234567");
    expect(made.snapshot()).toMatchObject({ bankAccountLast4: "4567" });

    // Left out on update: kept. A left-out account number keeps the stored one.
    made.update({ name: "Karthik R" }, "user_2", LATER);
    expect(made.profile.employeeCode).toBe("SE-1");
    made.update(
      { name: "Karthik R", profile: {}, bank: { bankName: "SBI" } },
      "user_2",
      LATER,
    );
    expect(made.profile.employeeCode).toBeNull();
    expect(made.bank).toMatchObject({
      accountNumber: "501001234567",
      ifsc: null,
      bankName: "SBI",
    });
    made.update(
      { name: "Karthik R", bank: { accountNumber: null } },
      "user_2",
      LATER,
    );
    expect(made.bank.accountNumber).toBeNull();
  });

  it("refuses a bad mobile and a blank name", () => {
    expect(codeOf(() => supervisor({ mobile: "12345" }))).toBe(
      "MOBILE_INVALID",
    );
    expect(
      codeOf(() => {
        supervisor().update({ name: "" }, "user_1", LATER);
      }),
    ).toBe("SUPERVISOR_NAME_REQUIRED");
  });

  it("updates, disables, enables and deletes", () => {
    const made = supervisor({ mobile: "+917708165767" });
    made.update({ name: "Dhuresh", mobile: null }, "user_2", LATER);
    expect(made.snapshot()).toMatchObject({
      name: "Dhuresh",
      mobile: null,
      teamMemberId: null,
      disabled: false,
    });
    expect(made.updatedAt).toEqual(LATER);
    expect(made.disable("user_2", LATER)).toBe(true);
    expect(made.disable("user_2", LATER)).toBe(false);
    expect(made.enable("user_2", LATER)).toBe(true);
    made.delete("user_2", LATER);
    expect(made.deletedBy).toBe("user_2");
    expect(
      codeOf(() => {
        made.delete("user_2", LATER);
      }),
    ).toBe("SUPERVISOR_NOT_FOUND");
  });
});
