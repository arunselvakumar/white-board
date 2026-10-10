import type { MonthKey } from "./calendar";

/**
 * What a payslip says (CM-316, `modules/10` "Salary slip"): the Company,
 * the member, the month, Attendance Details, Earnings, Gross, Statutory
 * Deductions (PF, ESI, PT), Absent and Unpaid Leave Deductions, Other
 * Deductions, Advance Recovered and Net Payable, plus the employer's
 * contributions. Built from a stored slip, so the PDF never recalculates.
 * Money is paise; the renderer formats it.
 */

export type PayslipLine = {
  label: string;
  /** Paise; null prints blank. */
  amount: number | null;
  /** A second amount column (the full-month figure of a component). */
  monthly?: number | null;
  emphasis?: boolean;
};

export type PayslipFact = { label: string; value: string };

export type PayslipDocument = {
  company: string;
  title: string;
  month: MonthKey;
  /** "October 2026". */
  monthLabel: string;
  member: PayslipFact[];
  attendance: PayslipFact[];
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  netPayable: number;
  employer: PayslipLine[];
  notes: string[];
  /** "Approved on … by …", shown under the title. */
  status: string;
  generatedAt: string;
  currency: string;
};

export type PayslipSlip = {
  month: MonthKey;
  daysInMonth: number;
  workingDays: number;
  present: number;
  halfDays: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  weekOff: number;
  holidays: number;
  payable: number;
  overtimeHours: number;
  totalHours: number;
  components: { name: string; monthly: number; earned: number }[];
  overtimePay: number;
  grossEarnings: number;
  pfEmployee: number;
  esiEmployee: number;
  professionalTax: number;
  absentDeduction: number;
  unpaidLeaveDeduction: number;
  otherDeductions: { name: string; charged: number }[];
  advanceRecovered: number;
  netPayable: number;
  pfEmployer: number;
  epsEmployer: number;
  esiEmployer: number;
  notEmployedDays: number;
  notEmployedDeduction: number;
  paidOvertimeHours: number;
  shortfall: {
    professionalTax: number;
    otherDeductions: number;
    advance: number;
  } | null;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A deduction taken off earnings, shown negative (never "-0"). */
function less(paise: number): number {
  return paise === 0 ? 0 : -paise;
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: MonthKey): string {
  const [year, number] = month.split("-");
  return `${MONTHS[Number(number) - 1] ?? month} ${year ?? ""}`.trim();
}

function days(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function hoursText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function buildPayslip(input: {
  company: string;
  currency: string;
  slip: PayslipSlip;
  member: {
    name: string;
    designation: string | null;
    uan: string | null;
    esiIpNumber: string | null;
  };
  status: string;
  generatedAt: string;
  formatMoney: (paise: number) => string;
}): PayslipDocument {
  const { slip } = input;
  const fullMonth = slip.components.reduce(
    (sum, line) => sum + line.monthly,
    0,
  );
  const member: PayslipFact[] = [
    { label: "Name", value: input.member.name },
    ...(input.member.designation == null
      ? []
      : [{ label: "Designation", value: input.member.designation }]),
    { label: "Month", value: monthLabel(slip.month) },
    ...(input.member.uan == null
      ? []
      : [{ label: "UAN", value: input.member.uan }]),
    ...(input.member.esiIpNumber == null
      ? []
      : [{ label: "ESI IP number", value: input.member.esiIpNumber }]),
  ];
  const attendance: PayslipFact[] = [
    { label: "Days in month", value: days(slip.daysInMonth) },
    { label: "Working days", value: days(slip.workingDays) },
    { label: "Present", value: days(slip.present) },
    { label: "Half days", value: days(slip.halfDays) },
    { label: "Absent", value: days(slip.absent) },
    { label: "Paid leave", value: days(slip.paidLeave) },
    { label: "Unpaid leave", value: days(slip.unpaidLeave) },
    { label: "Week off", value: days(slip.weekOff) },
    { label: "Holidays", value: days(slip.holidays) },
    ...(slip.notEmployedDays > 0
      ? [{ label: "Before joining", value: days(slip.notEmployedDays) }]
      : []),
    { label: "Payable days", value: days(slip.payable) },
    {
      label: "Overtime hours",
      value:
        slip.paidOvertimeHours === slip.overtimeHours
          ? hoursText(slip.overtimeHours)
          : `${hoursText(slip.overtimeHours)} (${hoursText(slip.paidOvertimeHours)} paid)`,
    },
    { label: "Total hours", value: hoursText(slip.totalHours) },
  ];
  const earnings: PayslipLine[] = [
    ...slip.components.map((line) => ({
      label: line.name,
      monthly: line.monthly,
      amount: line.earned,
    })),
    { label: "Full-month salary", monthly: fullMonth, amount: null },
    ...(slip.notEmployedDeduction > 0
      ? [
          {
            label: "Less: days before joining",
            amount: less(slip.notEmployedDeduction),
          },
        ]
      : []),
    { label: "Less: Absent Deduction", amount: less(slip.absentDeduction) },
    {
      label: "Less: Unpaid Leave Deduction",
      amount: less(slip.unpaidLeaveDeduction),
    },
    { label: "Overtime pay", amount: slip.overtimePay },
    { label: "Gross Earnings", amount: slip.grossEarnings, emphasis: true },
  ];
  const otherTotal = slip.otherDeductions.reduce(
    (sum, line) => sum + line.charged,
    0,
  );
  const deductions: PayslipLine[] = [
    { label: "Provident Fund (PF)", amount: slip.pfEmployee },
    { label: "ESI", amount: slip.esiEmployee },
    { label: "Professional Tax", amount: slip.professionalTax },
    ...slip.otherDeductions.map((line) => ({
      label: line.name,
      amount: line.charged,
    })),
    { label: "Advance Recovered", amount: slip.advanceRecovered },
    {
      label: "Total Deductions",
      amount:
        slip.pfEmployee +
        slip.esiEmployee +
        slip.professionalTax +
        otherTotal +
        slip.advanceRecovered,
      emphasis: true,
    },
  ];
  const employer: PayslipLine[] = [
    { label: "Employer PF (EPF)", amount: slip.pfEmployer },
    { label: "Employer pension (EPS)", amount: slip.epsEmployer },
    { label: "Employer ESI", amount: slip.esiEmployer },
  ];
  const notes: string[] = [];
  if (slip.shortfall != null) {
    const parts = [
      slip.shortfall.advance > 0
        ? `advance ${input.formatMoney(slip.shortfall.advance)}`
        : null,
      slip.shortfall.otherDeductions > 0
        ? `other deductions ${input.formatMoney(slip.shortfall.otherDeductions)}`
        : null,
      slip.shortfall.professionalTax > 0
        ? `professional tax ${input.formatMoney(slip.shortfall.professionalTax)}`
        : null,
    ].filter((part): part is string => part != null);
    notes.push(
      `Not taken this month so that net pay is not negative: ${parts.join(", ")}. An advance not recovered stays outstanding.`,
    );
  }
  notes.push(
    "Absent and unpaid leave deductions are already taken off the earnings. Employer contributions are not deducted from pay.",
  );
  return {
    company: input.company,
    title: "Payslip",
    month: slip.month,
    monthLabel: monthLabel(slip.month),
    member,
    attendance,
    earnings,
    deductions,
    netPayable: slip.netPayable,
    employer,
    notes,
    status: input.status,
    generatedAt: input.generatedAt,
    currency: input.currency,
  };
}
