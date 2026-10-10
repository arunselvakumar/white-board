import { describe, expect, it } from "vitest";

import {
  buildEcrReturn,
  buildEsiReturn,
  ecrText,
  esiAmountText,
  esiDays,
  ncpDays,
  rupees,
  type StatutoryReturnSlip,
} from "./statutory-returns";

const CEILING = 1_500_000; // ₹15,000

function slip(
  overrides: Partial<Omit<StatutoryReturnSlip, "pf" | "esi">> & {
    pf?: Partial<StatutoryReturnSlip["pf"]>;
    esi?: Partial<StatutoryReturnSlip["esi"]>;
  } = {},
): StatutoryReturnSlip {
  const { pf, esi, ...rest } = overrides;
  return {
    memberId: "m-1",
    name: "Priya Raman",
    uan: "100200300400",
    esiIpNumber: "1234567890",
    daysInMonth: 30,
    payableDays: 30,
    grossEarnings: 3_000_050, // ₹30,000.50
    ...rest,
    pf: {
      applicable: true,
      wage: 1_500_000,
      contributoryWage: 1_500_000,
      tableWageCeiling: CEILING,
      employeePercent: "12.00",
      epsPercent: "8.33",
      employee: 180_000,
      employerEpf: 55_100,
      employerEps: 124_900,
      ...pf,
    },
    esi: {
      applicable: false,
      employee: 0,
      employer: 0,
      ...esi,
    },
  };
}

describe("rupees", () => {
  it("rounds paise half up to whole rupees", () => {
    expect(rupees(3_000_050)).toBe(30_001);
    expect(rupees(3_000_049)).toBe(30_000);
    expect(rupees(0)).toBe(0);
  });
});

describe("ncpDays", () => {
  it("is the days not paid, whole days only", () => {
    expect(ncpDays(30, 30)).toBe(0);
    expect(ncpDays(30, 27)).toBe(3);
    // A half-paid day is contributory: 1.5 unpaid days are 1 NCP day.
    expect(ncpDays(31, 29.5)).toBe(1);
  });

  it("is every day of the month for a member paid nothing", () => {
    expect(ncpDays(28, 0)).toBe(28);
  });
});

describe("esiDays", () => {
  it("rounds a fraction up to the next whole day", () => {
    expect(esiDays(29.5)).toBe(30);
    expect(esiDays(30)).toBe(30);
    expect(esiDays(0)).toBe(0);
  });
});

describe("buildEcrReturn", () => {
  it("builds one row per PF member in whole rupees", () => {
    const ecr = buildEcrReturn([slip()]);
    expect(ecr.rows).toEqual([
      {
        memberId: "m-1",
        uan: "100200300400",
        name: "Priya Raman",
        grossWages: 30_001,
        epfWages: 15_000,
        epsWages: 15_000,
        edliWages: 15_000,
        epfContribution: 1_800,
        epsContribution: 1_249,
        epfEpsDifference: 551,
        ncpDays: 0,
        refundOfAdvances: 0,
      },
    ]);
    expect(ecr.missingUan).toEqual([]);
  });

  it("caps EPS and EDLI wages at the statutory ceiling when PF is on a higher wage", () => {
    const ecr = buildEcrReturn([
      slip({
        pf: {
          wage: 2_000_000,
          contributoryWage: 2_000_000,
          employee: 240_000,
          employerEpf: 115_100,
          employerEps: 124_900,
        },
      }),
    ]);
    expect(ecr.rows[0]).toMatchObject({
      epfWages: 20_000,
      epsWages: 15_000,
      edliWages: 15_000,
      epfContribution: 2_400,
    });
  });

  it("keeps a lower PF wage as it is", () => {
    const ecr = buildEcrReturn([
      slip({
        payableDays: 27,
        pf: {
          wage: 1_350_000,
          contributoryWage: 1_350_000,
          employee: 162_000,
          employerEpf: 49_550,
          employerEps: 112_450,
        },
      }),
    ]);
    expect(ecr.rows[0]).toMatchObject({
      epfWages: 13_500,
      epsWages: 13_500,
      edliWages: 13_500,
      ncpDays: 3,
    });
  });

  it("works the wages back from the shares on slips calculated before CM-320", () => {
    const ecr = buildEcrReturn([
      slip({ pf: { wage: null, contributoryWage: null } }),
    ]);
    expect(ecr.rows[0]).toMatchObject({
      epfWages: 15_000,
      epsWages: 14_994,
      edliWages: 15_000,
    });
  });

  it("lists PF members without a UAN apart and leaves out members without PF", () => {
    const ecr = buildEcrReturn([
      slip({ memberId: "m-2", name: "Ravi Kumar", uan: null }),
      slip({ memberId: "m-3", name: "Anand", pf: { applicable: false } }),
      slip({ memberId: "m-4", name: "Bala", uan: "  " }),
    ]);
    expect(ecr.rows).toEqual([]);
    expect(ecr.missingUan.map((gap) => gap.name)).toEqual([
      "Bala",
      "Ravi Kumar",
    ]);
  });

  it("totals every column and sorts by name", () => {
    const ecr = buildEcrReturn([
      slip({ memberId: "m-2", name: "Ravi Kumar", payableDays: 28 }),
      slip(),
    ]);
    expect(ecr.rows.map((row) => row.name)).toEqual([
      "Priya Raman",
      "Ravi Kumar",
    ]);
    expect(ecr.totals).toEqual({
      grossWages: 60_002,
      epfWages: 30_000,
      epsWages: 30_000,
      edliWages: 30_000,
      epfContribution: 3_600,
      epsContribution: 2_498,
      epfEpsDifference: 1_102,
      ncpDays: 2,
      refundOfAdvances: 0,
    });
  });
});

describe("ecrText", () => {
  it("writes `#~#` lines with CRLF and no header, keeping names clean", () => {
    const text = ecrText(buildEcrReturn([slip({ name: "Priya #~# Raman\n" })]));
    expect(text).toBe(
      "100200300400#~#Priya Raman#~#30001#~#15000#~#15000#~#15000#~#1800#~#1249#~#551#~#0#~#0\r\n",
    );
  });

  it("is empty when no member has a UAN", () => {
    expect(ecrText(buildEcrReturn([slip({ uan: null })]))).toBe("");
  });
});

describe("buildEsiReturn", () => {
  const esiSlip = (
    overrides: Parameters<typeof slip>[0] = {},
  ): StatutoryReturnSlip =>
    slip({
      grossEarnings: 1_800_050,
      payableDays: 29.5,
      daysInMonth: 30,
      esi: { applicable: true, employee: 13_600, employer: 58_600 },
      ...overrides,
    });

  it("lists ESI members with days rounded up and wages with paise", () => {
    const esi = buildEsiReturn([esiSlip()]);
    expect(esi.rows).toEqual([
      {
        memberId: "m-1",
        ipNumber: "1234567890",
        name: "Priya Raman",
        days: 30,
        wages: 18_000.5,
        reasonCode: 0,
        lastWorkingDay: null,
        employeeShare: 136,
        employerShare: 586,
      },
    ]);
  });

  it("leaves out members without ESI and lists members without an IP number", () => {
    const esi = buildEsiReturn([
      esiSlip({ memberId: "m-2", name: "Ravi", esiIpNumber: null }),
      slip({ memberId: "m-3", name: "Anand" }),
    ]);
    expect(esi.rows).toEqual([]);
    expect(esi.missingIpNumber).toEqual([
      {
        memberId: "m-2",
        name: "Ravi",
        reason: "No ESI IP number on Employee Management.",
      },
    ]);
    expect(esi.totals).toEqual({
      days: 0,
      wages: 0,
      employeeShare: 0,
      employerShare: 0,
    });
  });

  it("gives a member paid for no day 0 days and reason code 0", () => {
    const esi = buildEsiReturn([
      esiSlip({ payableDays: 0, grossEarnings: 0, esi: { applicable: true } }),
    ]);
    expect(esi.rows[0]).toMatchObject({ days: 0, wages: 0, reasonCode: 0 });
  });

  it("keeps only letters and spaces in IP names", () => {
    const esi = buildEsiReturn([esiSlip({ name: "S. Kumar-Raj 2" })]);
    expect(esi.rows[0]?.name).toBe("S Kumar Raj");
  });

  it("totals in paise, so the sums have no float drift", () => {
    const esi = buildEsiReturn([
      esiSlip(),
      esiSlip({ memberId: "m-2", name: "Ravi", grossEarnings: 1_000_010 }),
      esiSlip({ memberId: "m-3", name: "Bala", grossEarnings: 1_000_020 }),
    ]);
    expect(esi.totals).toEqual({
      days: 90,
      wages: 38_000.8,
      employeeShare: 408,
      employerShare: 1_758,
    });
  });
});

describe("esiAmountText", () => {
  it("writes whole rupees bare and paise with two decimals", () => {
    expect(esiAmountText(15_000)).toBe("15000");
    expect(esiAmountText(18_000.5)).toBe("18000.50");
  });
});
