import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  closeHindrance,
  daysLost,
  hindranceFields,
  hindranceSignOff,
  hindranceStatus,
  isOpenOn,
  overlapsRange,
  type HindranceInput,
} from "./hindrance";

const TODAY = "2026-10-11";

function refusal(fn: () => unknown): {
  code: string;
  field: unknown;
  kind: string;
} {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        kind: error.kind,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

const BASE: HindranceInput = {
  startDate: "2026-10-05",
  cause: "weather",
  affectedActivity: "Roof slab shuttering",
  responsibleParty: "force_majeure",
};

describe("hindranceFields", () => {
  it("normalises a hindrance", () => {
    expect(
      hindranceFields(
        {
          ...BASE,
          endDate: "2026-10-07",
          hoursLost: "16.50",
          description: "  Heavy rain ",
          contractorId: "ignored-when-not-contractor",
        },
        TODAY,
      ),
    ).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-07",
      hoursLost: "16.5",
      cause: "weather",
      affectedActivity: "Roof slab shuttering",
      responsibleParty: "force_majeure",
      contractorId: null,
      description: "Heavy rain",
      signOff: null,
    });
  });

  it("needs a Contractor when the party is a Contractor", () => {
    expect(
      refusal(() =>
        hindranceFields({ ...BASE, responsibleParty: "contractor" }, TODAY),
      ),
    ).toMatchObject({
      code: "HINDRANCE_CONTRACTOR_REQUIRED",
      field: "contractorId",
    });
    expect(
      hindranceFields(
        { ...BASE, responsibleParty: "contractor", contractorId: "c-1" },
        TODAY,
      ).contractorId,
    ).toBe("c-1");
  });

  it("refuses an end before the start, future dates and bad values", () => {
    expect(
      refusal(() => hindranceFields({ ...BASE, endDate: "2026-10-04" }, TODAY)),
    ).toMatchObject({ code: "HINDRANCE_END_BEFORE_START", field: "endDate" });
    expect(
      refusal(() =>
        hindranceFields({ ...BASE, startDate: "2026-10-12" }, TODAY),
      ),
    ).toMatchObject({ code: "HINDRANCE_DATE_IN_FUTURE", field: "startDate" });
    expect(
      refusal(() => hindranceFields({ ...BASE, endDate: "2026-10-12" }, TODAY)),
    ).toMatchObject({ code: "HINDRANCE_DATE_IN_FUTURE", field: "endDate" });
    expect(
      refusal(() => hindranceFields({ ...BASE, hoursLost: "-2" }, TODAY)),
    ).toMatchObject({
      code: "HINDRANCE_HOURS_INVALID",
    });
    expect(
      refusal(() => hindranceFields({ ...BASE, hoursLost: "1.234" }, TODAY)),
    ).toMatchObject({
      code: "HINDRANCE_HOURS_INVALID",
    });
    expect(
      refusal(() => hindranceFields({ ...BASE, cause: "aliens" }, TODAY)),
    ).toMatchObject({
      code: "HINDRANCE_CAUSE_INVALID",
      field: "cause",
    });
    expect(
      refusal(() =>
        hindranceFields({ ...BASE, responsibleParty: "god" }, TODAY),
      ),
    ).toMatchObject({ code: "HINDRANCE_PARTY_INVALID" });
    expect(
      refusal(() =>
        hindranceFields({ ...BASE, affectedActivity: "  " }, TODAY),
      ),
    ).toMatchObject({
      code: "HINDRANCE_ACTIVITY_REQUIRED",
      field: "affectedActivity",
    });
    expect(
      refusal(() =>
        hindranceFields({ ...BASE, affectedActivity: "x".repeat(201) }, TODAY),
      ),
    ).toMatchObject({ code: "TEXT_TOO_LONG", field: "affectedActivity" });
  });
});

describe("hindranceSignOff", () => {
  it("is all-or-none of the party name and the date", () => {
    expect(hindranceSignOff(null, "2026-10-05", TODAY)).toBeNull();
    expect(
      hindranceSignOff(
        { userId: "", partyName: " ", signedOn: "" },
        "2026-10-05",
        TODAY,
      ),
    ).toBeNull();
    expect(
      refusal(() =>
        hindranceSignOff({ partyName: "Suresh (PMC)" }, "2026-10-05", TODAY),
      ),
    ).toMatchObject({
      code: "HINDRANCE_SIGN_OFF_INCOMPLETE",
      field: "signOff.signedOn",
    });
    expect(
      refusal(() =>
        hindranceSignOff({ signedOn: "2026-10-06" }, "2026-10-05", TODAY),
      ),
    ).toMatchObject({
      code: "HINDRANCE_SIGN_OFF_INCOMPLETE",
      field: "signOff.partyName",
    });
    expect(
      refusal(() => hindranceSignOff({ userId: "u-1" }, "2026-10-05", TODAY)),
    ).toMatchObject({ code: "HINDRANCE_SIGN_OFF_INCOMPLETE" });
    expect(
      refusal(() =>
        hindranceSignOff(
          { partyName: "Suresh", signedOn: "2026-10-04" },
          "2026-10-05",
          TODAY,
        ),
      ),
    ).toMatchObject({ code: "HINDRANCE_SIGNED_BEFORE_START" });
    expect(
      hindranceSignOff(
        {
          userId: "u-1",
          partyName: "Suresh",
          partyRole: "PMC engineer",
          signedOn: "2026-10-06",
        },
        "2026-10-05",
        TODAY,
      ),
    ).toEqual({
      userId: "u-1",
      partyName: "Suresh",
      partyRole: "PMC engineer",
      signedOn: "2026-10-06",
    });
  });
});

describe("status, days lost and dates", () => {
  it("derives the status and counts days both ends", () => {
    expect(hindranceStatus(null)).toBe("open");
    expect(hindranceStatus("2026-10-07")).toBe("closed");
    expect(daysLost("2026-10-05", "2026-10-07", TODAY)).toBe(3);
    expect(daysLost("2026-10-05", "2026-10-05", TODAY)).toBe(1);
    expect(daysLost("2026-10-05", null, TODAY)).toBe(7);
    expect(daysLost(TODAY, null, TODAY)).toBe(1);
  });

  it("is on a date's register while open on it", () => {
    const closed = { startDate: "2026-10-05", endDate: "2026-10-07" };
    const open = { startDate: "2026-10-05", endDate: null };
    expect(isOpenOn(closed, "2026-10-04")).toBe(false);
    expect(isOpenOn(closed, "2026-10-05")).toBe(true);
    expect(isOpenOn(closed, "2026-10-07")).toBe(true);
    expect(isOpenOn(closed, "2026-10-08")).toBe(false);
    expect(isOpenOn(open, "2026-12-31")).toBe(true);
  });

  it("overlaps a date range", () => {
    const closed = { startDate: "2026-10-05", endDate: "2026-10-07" };
    expect(overlapsRange(closed, "2026-10-07", "2026-10-09")).toBe(true);
    expect(overlapsRange(closed, "2026-10-08", null)).toBe(false);
    expect(overlapsRange(closed, null, "2026-10-04")).toBe(false);
    expect(overlapsRange(closed, null, null)).toBe(true);
    expect(
      overlapsRange(
        { startDate: "2026-09-01", endDate: null },
        "2026-10-08",
        "2026-10-09",
      ),
    ).toBe(true);
  });
});

describe("closeHindrance", () => {
  const open = { startDate: "2026-10-05", endDate: null, hoursLost: "4" };

  it("sets the end date and, when given, the hours lost", () => {
    expect(closeHindrance(open, { endDate: "2026-10-06" }, TODAY)).toEqual({
      endDate: "2026-10-06",
      hoursLost: "4",
    });
    expect(
      closeHindrance(open, { endDate: "2026-10-06", hoursLost: "12" }, TODAY),
    ).toEqual({
      endDate: "2026-10-06",
      hoursLost: "12",
    });
    expect(
      closeHindrance(open, { endDate: "2026-10-06", hoursLost: null }, TODAY)
        .hoursLost,
    ).toBeNull();
  });

  it("refuses a closed one, a missing end and an end before the start", () => {
    expect(
      refusal(() =>
        closeHindrance(
          { ...open, endDate: "2026-10-06" },
          { endDate: "2026-10-07" },
          TODAY,
        ),
      ),
    ).toMatchObject({ code: "HINDRANCE_CLOSED", kind: "conflict" });
    expect(
      refusal(() => closeHindrance(open, { endDate: "" }, TODAY)),
    ).toMatchObject({
      code: "HINDRANCE_END_REQUIRED",
    });
    expect(
      refusal(() => closeHindrance(open, { endDate: "2026-10-01" }, TODAY)),
    ).toMatchObject({
      code: "HINDRANCE_END_BEFORE_START",
    });
  });
});
