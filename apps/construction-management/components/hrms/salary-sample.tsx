"use client";

import { useState } from "react";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";

import { FieldError } from "@/components/auth/field-error";
import {
  formatPaise,
  isRupees,
  MoneyInput,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  sampleSalary,
  type SalaryBreakdown,
  type SalaryStatutoryFigures,
} from "@/src/hrms/domain/salary-calculation";
import type { SalaryStructure } from "@/src/hrms/domain/salary-structure";
import { DomainError } from "@/src/shared-kernel/domain-error";
import type { SalaryStatutoryModel } from "@/src/queries/hrms-salary-setup";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthLabel(month: string): string {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00.000Z`));
}

/** The statutory response as the calculator's input. */
export function statutoryFigures(
  model: SalaryStatutoryModel,
): SalaryStatutoryFigures {
  return {
    pf: model.pf,
    esi: model.esi,
    ptStateCode: model.ptStateCode,
    ptSlabs: model.ptSlabs,
  };
}

function Line({
  label,
  amount,
  strong = false,
  negative = false,
}: {
  label: string;
  amount: number;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex items-baseline justify-between gap-3 font-semibold"
          : "flex items-baseline justify-between gap-3 text-sm"
      }
    >
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">
        {negative && amount > 0 ? "− " : ""}
        {formatPaise(amount)}
      </dd>
    </div>
  );
}

function Breakdown({ slip }: { slip: SalaryBreakdown }) {
  const snapshot = slip.statutorySnapshot;
  return (
    <div className="space-y-4">
      <dl className="space-y-1.5" aria-label="Earnings">
        {slip.earnings.map((line) => (
          <Line key={line.componentId} label={line.name} amount={line.earned} />
        ))}
        <Line label="Gross" amount={slip.grossEarnings} strong />
      </dl>
      <Separator />
      <dl className="space-y-1.5" aria-label="Deductions">
        <Line label="PF" amount={slip.pf.employee} negative />
        <Line label="ESI" amount={slip.esi.employee} negative />
        <Line label="Professional tax" amount={slip.professionalTax} negative />
        {slip.otherDeductions.map((line) => (
          <Line
            key={line.name}
            label={line.name}
            amount={line.charged}
            negative
          />
        ))}
        <Line label="Net pay" amount={slip.netPayable} strong />
      </dl>
      <Separator />
      <dl className="space-y-1.5" aria-label="Employer contributions">
        <Line label="Employer PF (EPF + EPS)" amount={slip.pf.employerTotal} />
        <Line label="Employer ESI" amount={slip.esi.employer} />
      </dl>
      <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
        {snapshot.pf.applicable && snapshot.pf.wageCeiling != null ? (
          <li>
            PF on {formatPaise(slip.pf.contributoryWage)}
            {snapshot.pf.capAtCeiling
              ? `, capped at ${formatPaise(snapshot.pf.wageCeiling)}`
              : ", not capped"}
            .
          </li>
        ) : null}
        {snapshot.esi.applicable && !snapshot.esi.eligible ? (
          <li>
            No ESI: gross is above{" "}
            {snapshot.esi.wageCeiling == null
              ? "the ceiling"
              : formatPaise(snapshot.esi.wageCeiling)}
            .
          </li>
        ) : null}
        {snapshot.pt.applicable && snapshot.pt.basis === "none" ? (
          <li>No professional tax state is chosen in HRMS Settings.</li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * The structure's sample calculation (CM-314): a full month present for a
 * base salary the admin types, worked out by the same calculator the
 * salary run uses, with this month's statutory figures.
 */
export function SalarySample({
  structure,
  problem,
  statutory,
}: {
  /** The structure as typed so far; null while it breaks a rule. */
  structure: SalaryStructure | null;
  /** Why the structure cannot be worked out yet. */
  problem: string | null;
  statutory: SalaryStatutoryModel;
}) {
  const [base, setBase] = useState("30000");
  const valid = isRupees(base);
  let slip: SalaryBreakdown | null = null;
  let error: string | null = valid ? null : "Enter an amount in rupees";
  if (structure != null && valid) {
    try {
      slip = sampleSalary({
        structure,
        baseMonthly: rupeesToPaise(base) ?? 0,
        month: statutory.month,
        statutory: statutoryFigures(statutory),
      });
    } catch (caught) {
      if (!(caught instanceof DomainError)) throw caught;
      error = caught.message;
    }
  }
  return (
    <section
      aria-labelledby="salary-sample-title"
      className="space-y-4 rounded-xl border p-6"
    >
      <div className="space-y-1">
        <h3 id="salary-sample-title" className="text-lg font-semibold">
          Sample calculation
        </h3>
        <p className="text-muted-foreground text-sm">
          A full month present in {monthLabel(statutory.month)}.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="salary-sample-base">Base salary a month</Label>
        <MoneyInput
          id="salary-sample-base"
          value={base}
          aria-invalid={!valid}
          onChange={(event) => {
            setBase(event.target.value);
          }}
        />
        <FieldError message={error ?? undefined} />
      </div>
      {slip != null ? (
        <Breakdown slip={slip} />
      ) : (
        <p role="status" className="text-muted-foreground text-sm">
          {problem ?? "Fix the base salary to see the calculation."}
        </p>
      )}
    </section>
  );
}
