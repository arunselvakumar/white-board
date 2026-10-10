import {
  divideRounded,
  parseDecimal,
  pow10,
} from "@/src/shared-kernel/decimal";

/**
 * PF and ESI challan inputs for an approved salary month (CM-320), built
 * from the stored salary slips as pure functions: no database, no clock.
 *
 * PF — the EPFO Electronic Challan cum Return (ECR 2.0) upload: a text
 * file, one line per member, eleven fields separated by `#~#`, no header,
 * whole rupees, NCP days a whole number (no half day):
 *
 *   UAN, Member name, Gross wages, EPF wages, EPS wages, EDLI wages,
 *   EPF contribution remitted (employee share), EPS contribution
 *   remitted, EPF-EPS difference remitted (employer A/c 1), NCP days,
 *   Refund of advances.
 *
 * Sources: EPFO, "Introduction ECR 2.0"
 * (https://www.epfindia.gov.in/site_docs/PDFs/EPFOUnifiedPortal/Introduction_ECR2.0.pdf):
 * the eleven fields in this order, NCP days numeric without decimals, a
 * zero-wage member's NCP days equal the days in the month, half-day NCP
 * not permitted; EPFO "ECR file structure"
 * (https://epfindia.gov.in/site_docs/PDFs/OnlineECR_PDFs/ECR_ForEmployers_FileStructure.pdf):
 * fields separated by `#~#`; EPFO "Revamped ECR"
 * (https://www.epfindia.gov.in/site_en/revamped_ecr.php, wage month
 * September 2025 on): return and payment are filed separately, "no change
 * in the existing format of the ECR".
 *
 * ESI — the ESIC monthly contribution upload (the portal's "Sample
 * Template", MC template): IP Number (10 digits), IP Name (letters and
 * spaces), No. of days for which wages paid/payable during the month
 * (whole days; a fraction is rounded up), Total monthly wages, Reason code
 * for zero working days (numeric; 0 for all other reasons), Last working
 * day (DD/MM/YYYY, only for an IP who left). Every cell is text. Sources:
 * ESIC employer portal → Monthly Contributions → "Sample Template" and its
 * guidelines sheet (https://www.esic.gov.in/, login required), as
 * described by Pocket HRMS "ESI return file"
 * (https://docs.pockethrms.com/report-generation/esi-return-file) and
 * Zoho Payroll "ESIC return report"
 * (https://www.zoho.com/en-in/erp/help/analytic-reports/payroll-reports/statutory-reports/esic-return-report.html).
 * The portal takes the Excel 97-2003 (`.xls`) format; the workbook is
 * `.xlsx`, so it is opened in Excel and saved as `.xls` before upload.
 */

/** One stored regular slip, as the returns need it. Money is paise. */
export type StatutoryReturnSlip = {
  memberId: string;
  /** As on the slip's statutory snapshot (at calculation). */
  name: string;
  uan: string | null;
  esiIpNumber: string | null;
  daysInMonth: number;
  /** Days paid (halves allowed). */
  payableDays: number;
  grossEarnings: number;
  pf: {
    /** The structure had PF on and a PF rate was in force. */
    applicable: boolean;
    /** Earned components counting for PF wage; null on slips before CM-320. */
    wage: number | null;
    /** The PF wage after the ceiling; null on slips before CM-320. */
    contributoryWage: number | null;
    /** The table's (statutory) wage ceiling: EPS and EDLI never pass it. */
    tableWageCeiling: number | null;
    employeePercent: string | null;
    epsPercent: string | null;
    employee: number;
    /** Employer EPF (A/c 1). */
    employerEpf: number;
    /** Employer EPS (A/c 10). */
    employerEps: number;
  };
  esi: {
    /** The structure had ESI on and the member was eligible. */
    applicable: boolean;
    employee: number;
    employer: number;
  };
};

/** A member left out of a return, and why. */
export type ReturnGap = { memberId: string; name: string; reason: string };

/** One ECR line, whole rupees. */
export type EcrRow = {
  memberId: string;
  uan: string;
  name: string;
  grossWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  epfContribution: number;
  epsContribution: number;
  epfEpsDifference: number;
  ncpDays: number;
  refundOfAdvances: number;
};

export type EcrTotals = Omit<EcrRow, "memberId" | "uan" | "name">;

export type EcrReturn = {
  rows: EcrRow[];
  /** PF members without a UAN: not in the text file, listed instead. */
  missingUan: ReturnGap[];
  totals: EcrTotals;
};

/** One ESIC upload row; wages in rupees (two decimals at most). */
export type EsiRow = {
  memberId: string;
  ipNumber: string;
  name: string;
  days: number;
  wages: number;
  /** 0 = without reason / all other reasons (ESIC reason codes). */
  reasonCode: number;
  /** `DD/MM/YYYY`; only for an IP who left. Never filled (exits are not recorded). */
  lastWorkingDay: string | null;
  /** Employee and employer shares, rupees, for the contribution sheet. */
  employeeShare: number;
  employerShare: number;
};

export type EsiTotals = {
  days: number;
  wages: number;
  employeeShare: number;
  employerShare: number;
};

export type EsiReturn = {
  rows: EsiRow[];
  /** ESI-eligible members without an IP number. */
  missingIpNumber: ReturnGap[];
  totals: EsiTotals;
};

/** ESIC "Reason code for zero working days" (the template's guidelines sheet). */
export const ESI_REASON_CODES: readonly { code: number; reason: string }[] = [
  { code: 0, reason: "Without Reason" },
  { code: 1, reason: "On Leave" },
  { code: 2, reason: "Left Service" },
  { code: 3, reason: "Retired" },
  { code: 4, reason: "Out of Coverage" },
  { code: 5, reason: "Expired" },
  { code: 6, reason: "Non Implemented area" },
  { code: 7, reason: "Compliance by Immediate Employer" },
  { code: 8, reason: "Suspension of work" },
  { code: 9, reason: "Strike/Lockout" },
  { code: 10, reason: "Retrenchment" },
  { code: 11, reason: "No Work" },
  { code: 12, reason: "Doesnt Belong To This Employer" },
];

/** The ECR field separator. */
export const ECR_SEPARATOR = "#~#";

/** Paise to whole rupees, half up (EPFO takes no decimals). */
export function rupees(paise: number): number {
  return Math.sign(paise) * Math.round(Math.abs(paise) / 100);
}

/** Paise to rupees with paise kept (ESIC wages take two decimals). */
function rupeesExact(paise: number): number {
  return paise / 100;
}

/**
 * NCP (non-contributing) days: the days of the month not paid. ECR takes
 * whole days only, so a half-paid day counts as paid (rounded down); a
 * member paid nothing has every day of the month.
 */
export function ncpDays(daysInMonth: number, payableDays: number): number {
  const unpaid = Math.max(0, daysInMonth - payableDays);
  return Math.min(daysInMonth, Math.floor(unpaid));
}

/** ESIC days paid: whole days, a fraction rounded up. */
export function esiDays(payableDays: number): number {
  return Math.max(0, Math.ceil(payableDays));
}

/** A name safe for the `#~#` line: no separators, no line breaks. */
function ecrName(name: string): string {
  return name
    .replace(/[#~\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ESIC IP names: letters and spaces only. */
function esiName(name: string): string {
  return name
    .replace(/[^\p{L}\p{M} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `share × 100 ÷ percent`, to the paisa: the wage a share was charged on. */
function wageFromShare(share: number, percent: string | null): number {
  if (percent == null || share === 0) return 0;
  const { numerator, scale } = parseDecimal(percent);
  if (numerator === 0n) return 0;
  return Number(divideRounded(BigInt(share) * 100n * pow10(scale), numerator));
}

function capped(value: number, ceiling: number | null): number {
  return ceiling == null ? value : Math.min(value, ceiling);
}

function byName<Row extends { name: string }>(a: Row, b: Row): number {
  return a.name.localeCompare(b.name, "en-IN");
}

/**
 * The month's ECR: one row per member whose slip had PF, whole rupees.
 * EPF wages = the PF wage after the ceiling; EPS wages = the PF wage up
 * to the statutory ceiling (what EPS was charged on); EDLI wages = EPF
 * wages capped at the statutory ceiling; NCP days = days not paid;
 * refunds 0 (advances are not PF refunds). Members without a UAN are
 * listed apart, never dropped.
 */
export function buildEcrReturn(
  slips: readonly StatutoryReturnSlip[],
): EcrReturn {
  const rows: EcrRow[] = [];
  const missingUan: ReturnGap[] = [];
  for (const slip of slips) {
    if (!slip.pf.applicable) continue;
    const uan = slip.uan?.trim() ?? "";
    if (uan.length === 0) {
      missingUan.push({
        memberId: slip.memberId,
        name: slip.name,
        reason: "No UAN on Employee Management.",
      });
      continue;
    }
    const ceiling = slip.pf.tableWageCeiling;
    // Slips calculated before CM-320 kept no wages: work them back from
    // the shares and the rates on the slip.
    const pfWage =
      slip.pf.wage ?? wageFromShare(slip.pf.employerEps, slip.pf.epsPercent);
    const epfWage =
      slip.pf.contributoryWage ??
      wageFromShare(slip.pf.employee, slip.pf.employeePercent);
    const epsWage = capped(pfWage, ceiling);
    rows.push({
      memberId: slip.memberId,
      uan,
      name: ecrName(slip.name),
      grossWages: rupees(slip.grossEarnings),
      epfWages: rupees(epfWage),
      epsWages: rupees(epsWage),
      edliWages: rupees(capped(epfWage, ceiling)),
      epfContribution: rupees(slip.pf.employee),
      epsContribution: rupees(slip.pf.employerEps),
      epfEpsDifference: rupees(slip.pf.employerEpf),
      ncpDays: ncpDays(slip.daysInMonth, slip.payableDays),
      refundOfAdvances: 0,
    });
  }
  rows.sort(byName);
  missingUan.sort(byName);
  const totals: EcrTotals = {
    grossWages: 0,
    epfWages: 0,
    epsWages: 0,
    edliWages: 0,
    epfContribution: 0,
    epsContribution: 0,
    epfEpsDifference: 0,
    ncpDays: 0,
    refundOfAdvances: 0,
  };
  for (const row of rows)
    for (const key of Object.keys(totals) as (keyof EcrTotals)[])
      totals[key] += row[key];
  return { rows, missingUan, totals };
}

/** The ECR text file: one `#~#` line per member, no header, CRLF line ends. */
export function ecrText(ecr: EcrReturn): string {
  return ecr.rows
    .map((row) =>
      [
        row.uan,
        row.name,
        row.grossWages,
        row.epfWages,
        row.epsWages,
        row.edliWages,
        row.epfContribution,
        row.epsContribution,
        row.epfEpsDifference,
        row.ncpDays,
        row.refundOfAdvances,
      ]
        .map(String)
        .join(ECR_SEPARATOR),
    )
    .map((line) => `${line}\r\n`)
    .join("");
}

/**
 * The month's ESIC contribution rows: members whose slip had ESI (on in
 * the structure and eligible for the contribution period). Days paid are
 * whole (rounded up); wages are gross earnings with paise; a member paid
 * for no day gets reason code 0 for the employer to change if another
 * code applies. Members without an IP number are listed apart.
 */
export function buildEsiReturn(
  slips: readonly StatutoryReturnSlip[],
): EsiReturn {
  const rows: EsiRow[] = [];
  const missingIpNumber: ReturnGap[] = [];
  for (const slip of slips) {
    if (!slip.esi.applicable) continue;
    const ipNumber = slip.esiIpNumber?.trim() ?? "";
    if (ipNumber.length === 0) {
      missingIpNumber.push({
        memberId: slip.memberId,
        name: slip.name,
        reason: "No ESI IP number on Employee Management.",
      });
      continue;
    }
    rows.push({
      memberId: slip.memberId,
      ipNumber,
      name: esiName(slip.name),
      days: esiDays(slip.payableDays),
      wages: rupeesExact(slip.grossEarnings),
      reasonCode: 0,
      lastWorkingDay: null,
      employeeShare: rupeesExact(slip.esi.employee),
      employerShare: rupeesExact(slip.esi.employer),
    });
  }
  rows.sort(byName);
  missingIpNumber.sort(byName);
  // Sums in paise, so no float drift in the totals.
  const sum = (pick: (slip: StatutoryReturnSlip) => number) =>
    slips
      .filter(
        (slip) =>
          slip.esi.applicable && (slip.esiIpNumber?.trim() ?? "").length > 0,
      )
      .reduce((total, slip) => total + pick(slip), 0) / 100;
  return {
    rows,
    missingIpNumber,
    totals: {
      days: rows.reduce((total, row) => total + row.days, 0),
      wages: sum((slip) => slip.grossEarnings),
      employeeShare: sum((slip) => slip.esi.employee),
      employerShare: sum((slip) => slip.esi.employer),
    },
  };
}

/** ESIC wants every cell as text: `15234.5` → `15234.50`, `15000` → `15000`. */
export function esiAmountText(rupeesValue: number): string {
  return Number.isInteger(rupeesValue)
    ? String(rupeesValue)
    : rupeesValue.toFixed(2);
}
