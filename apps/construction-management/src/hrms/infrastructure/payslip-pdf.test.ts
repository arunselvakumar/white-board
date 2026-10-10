import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { formatMinor } from "@/src/shared-kernel/money";
import { scriptRuns } from "@/src/shared-kernel/pdf/noto-text";

import { buildPayslip, type PayslipSlip } from "../domain/payslip";
import { renderPayslipPdf } from "./payslip-pdf";

const SLIP: PayslipSlip = {
  month: "2026-10",
  daysInMonth: 31,
  workingDays: 22,
  present: 19,
  halfDays: 1,
  absent: 1,
  paidLeave: 1,
  unpaidLeave: 0,
  weekOff: 9,
  holidays: 0,
  payable: 29.5,
  overtimeHours: 3,
  totalHours: 170.5,
  components: [
    { name: "Basic", monthly: 1_500_000, earned: 1_427_419 },
    { name: "HRA", monthly: 600_000, earned: 570_968 },
  ],
  overtimePay: 81_290,
  grossEarnings: 2_079_677,
  pfEmployee: 171_300,
  esiEmployee: 15_600,
  professionalTax: 20_000,
  absentDeduction: 101_613,
  unpaidLeaveDeduction: 0,
  otherDeductions: [{ name: "Canteen", charged: 50_000 }],
  advanceRecovered: 333_334,
  netPayable: 1_488_443,
  pfEmployer: 52_400,
  epsEmployer: 118_900,
  esiEmployer: 67_600,
  notEmployedDays: 0,
  notEmployedDeduction: 0,
  paidOvertimeHours: 2,
  shortfall: null,
};

function payslip(name: string) {
  return buildPayslip({
    company: "श्री गणेश Constructions",
    currency: "INR",
    slip: SLIP,
    member: {
      name,
      designation: "Site Engineer",
      uan: "100200300400",
      esiIpNumber: null,
    },
    status: "Approved on 05 Nov 2026",
    generatedAt: "05 Nov 2026, 10:00 am",
    formatMoney: (paise) => formatMinor(paise),
  });
}

describe("scriptRuns", () => {
  it("splits a string into one run per script", () => {
    expect(scriptRuns("Ravi रवि ரவி")).toEqual([
      { script: "latin", text: "Ravi " },
      { script: "devanagari", text: "रवि" },
      { script: "latin", text: " " },
      { script: "tamil", text: "ரவி" },
    ]);
  });
});

describe("buildPayslip", () => {
  it("lists earnings down to gross, deductions with the advance, and the member's identifiers", () => {
    const document = payslip("Ravi Kumar");
    expect(document.monthLabel).toBe("October 2026");
    expect(document.member).toContainEqual({
      label: "UAN",
      value: "100200300400",
    });
    expect(document.member.map((fact) => fact.label)).not.toContain(
      "ESI IP number",
    );
    expect(document.earnings.at(-1)).toMatchObject({
      label: "Gross Earnings",
      amount: 2_079_677,
    });
    expect(document.deductions.map((line) => line.label)).toEqual([
      "Provident Fund (PF)",
      "ESI",
      "Professional Tax",
      "Canteen",
      "Advance Recovered",
      "Total Deductions",
    ]);
    expect(document.deductions.at(-1)?.amount).toBe(
      171_300 + 15_600 + 20_000 + 50_000 + 333_334,
    );
    expect(document.attendance).toContainEqual({
      label: "Overtime hours",
      value: "3 (2 paid)",
    });
  });
});

describe("renderPayslipPdf", () => {
  it("prints Indian scripts with embedded Noto fonts", async () => {
    const bytes = await renderPayslipPdf(payslip("रवि कुमार / ரவி குமார்"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const fonts = pdf.context
      .enumerateIndirectObjects()
      .flatMap(([, object]) =>
        object instanceof PDFDict &&
        object.get(PDFName.of("Type")) === PDFName.of("Font")
          ? [String(object.get(PDFName.of("BaseFont")))]
          : [],
      )
      .join(" ");
    expect(fonts).toContain("NotoSansDevanagari");
    expect(fonts).toContain("NotoSansTamil");
    expect(fonts).toContain("NotoSansDevanagari-Bold");
    expect(fonts).not.toContain("NotoSansBengali");
  });
});
