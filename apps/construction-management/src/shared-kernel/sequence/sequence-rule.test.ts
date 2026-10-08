import { describe, expect, it } from "vitest";

import { DomainError } from "../domain-error";
import {
  SEQUENCE_MODULES,
  counterYear,
  createSequenceRuleSettings,
  fiscalYearOf,
  formatSequenceNumber,
  standardSequenceSettings,
} from "./index";

describe("fiscal year (April–March)", () => {
  it("rolls over on 1 April", () => {
    expect(fiscalYearOf("2027-03-31")).toEqual({
      startYear: 2026,
      label: "26-27",
    });
    expect(fiscalYearOf("2027-04-01")).toEqual({
      startYear: 2027,
      label: "27-28",
    });
    expect(fiscalYearOf("2026-04-01").label).toBe("26-27");
    expect(fiscalYearOf("2100-01-15").label).toBe("99-00");
  });

  it("restarts counters per fiscal year only with the FY token on", () => {
    const withToken = createSequenceRuleSettings({ prefix: "PR" });
    const withoutToken = createSequenceRuleSettings({
      prefix: "PR",
      fiscalYearToken: false,
    });
    const march = fiscalYearOf("2027-03-31");
    const april = fiscalYearOf("2027-04-01");
    expect(counterYear(withToken, march)).toBe(2026);
    expect(counterYear(withToken, april)).toBe(2027);
    expect(counterYear(withoutToken, march)).toBe(
      counterYear(withoutToken, april),
    );
  });
});

describe("formatSequenceNumber", () => {
  it("joins prefix, fiscal year, project token and padded number", () => {
    const rule = createSequenceRuleSettings({
      prefix: "PR",
      projectToken: "P1",
    });
    expect(formatSequenceNumber(rule, fiscalYearOf("2026-10-08"), 1)).toBe(
      "PR/26-27/P1/00001",
    );
  });

  it("skips empty parts and never cuts long numbers", () => {
    const rule = createSequenceRuleSettings({
      prefix: "MDN",
      separator: "",
      fiscalYearToken: false,
      padding: 3,
    });
    expect(formatSequenceNumber(rule, fiscalYearOf("2026-10-08"), 7)).toBe(
      "MDN007",
    );
    expect(formatSequenceNumber(rule, fiscalYearOf("2026-10-08"), 12345)).toBe(
      "MDN12345",
    );
  });

  it("gives every module a standard rule like PR/26-27/00001", () => {
    expect(SEQUENCE_MODULES.map((item) => item.defaultPrefix)).toEqual([
      "PR",
      "PO",
      "GRN",
      "MT",
      "PC",
      "MR",
      "DN",
      "IR",
      "INV",
    ]);
    expect(
      formatSequenceNumber(
        standardSequenceSettings("goods_receipt"),
        fiscalYearOf("2026-10-08"),
        1,
      ),
    ).toBe("GRN/26-27/00001");
  });
});

describe("createSequenceRuleSettings", () => {
  it("defaults padding 5, separator / and the FY token on", () => {
    expect(createSequenceRuleSettings({ prefix: " PO " })).toEqual({
      prefix: "PO",
      projectToken: "",
      startNumber: 1,
      padding: 5,
      separator: "/",
      fiscalYearToken: true,
    });
  });

  it.each([
    [{ startNumber: 0 }, "SEQUENCE_START_NUMBER_INVALID"],
    [{ startNumber: 1.5 }, "SEQUENCE_START_NUMBER_INVALID"],
    [{ padding: 0 }, "SEQUENCE_PADDING_INVALID"],
    [{ padding: 11 }, "SEQUENCE_PADDING_INVALID"],
    [{ separator: "|" }, "SEQUENCE_SEPARATOR_INVALID"],
    [{ prefix: "PR 26" }, "SEQUENCE_PREFIX_INVALID"],
    [{ projectToken: "X".repeat(21) }, "SEQUENCE_PROJECT_TOKEN_INVALID"],
  ])("rejects %o", (input, code) => {
    expect(() => createSequenceRuleSettings(input)).toThrow(DomainError);
    try {
      createSequenceRuleSettings(input);
    } catch (error) {
      expect((error as DomainError).code).toBe(code);
    }
  });
});
