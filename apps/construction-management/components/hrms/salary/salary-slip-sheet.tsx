"use client";

import { Download, Eye } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";

import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  payslipUrl,
  useSalaryCommand,
  type SalarySlipModel,
} from "@/src/queries/hrms-salary";

import {
  days,
  formatDate,
  hours,
  money,
  monthLabel,
  PAYMENT_MODE_LABELS,
  SALARY_STATUS_LABELS,
  salaryStatusVariant,
} from "./salary-format";

export function SalaryStatusBadge({
  status,
}: {
  status: SalarySlipModel["status"];
}) {
  return (
    <Badge variant={salaryStatusVariant(status)}>
      {SALARY_STATUS_LABELS[status]}
    </Badge>
  );
}

function Line({
  label,
  value,
  strong = false,
  wide = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** Spans both columns of a two-column section. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        strong
          ? "flex justify-between gap-3 border-t px-3 py-2 font-medium"
          : "flex justify-between gap-3 px-3 py-1.5",
        wide && "col-span-2",
      )}
    >
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function Section({
  title,
  columns = 1,
  children,
}: {
  title: string;
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      <dl
        className={cn(
          "rounded-lg border py-1 text-sm",
          columns === 2 && "grid grid-cols-2",
        )}
      >
        {children}
      </dl>
    </section>
  );
}

/** Attendance Details, earnings, deductions and net of a regular slip. */
function RegularSlip({ slip }: { slip: SalarySlipModel }) {
  const a = slip.amounts;
  const d = slip.days;
  return (
    <>
      <Section title="Attendance Details" columns={2}>
        <Line label="Working days" value={days(d.workingDays)} />
        <Line label="Present" value={days(d.present)} />
        <Line label="Half days" value={days(d.halfDays)} />
        <Line label="Absent" value={days(d.absent)} />
        <Line label="Paid leave" value={days(d.paidLeave)} />
        <Line label="Unpaid leave" value={days(d.unpaidLeave)} />
        <Line label="Week off" value={days(d.weekOff)} />
        <Line label="Holidays" value={days(d.holidays)} />
        {d.notEmployed > 0 ? (
          <Line label="Before joining" value={days(d.notEmployed)} />
        ) : null}
        <Line
          label="Overtime"
          value={
            d.paidOvertimeHours === d.overtimeHours
              ? hours(d.overtimeHours)
              : `${hours(d.overtimeHours)} (${hours(d.paidOvertimeHours)} paid)`
          }
        />
        <Line label="Total hours" value={hours(d.totalHours)} />

        <Line
          label="Payable days"
          value={`${days(d.payable)} of ${String(d.daysInMonth)}`}
          strong
          wide
        />
      </Section>
      {a == null ? (
        <p className="text-muted-foreground text-sm">
          Amounts are hidden. Seeing them needs Financial on Salary Management.
        </p>
      ) : (
        <>
          <Section title="Earnings">
            {a.components.map((line) => (
              <Line
                key={line.name}
                label={`${line.name} (of ${money(line.monthly)})`}
                value={money(line.earned)}
              />
            ))}
            {a.notEmployedDeduction > 0 ? (
              <Line
                label="Less: days before joining"
                value={`−${money(a.notEmployedDeduction)}`}
              />
            ) : null}
            <Line
              label="Absent Deduction"
              value={
                a.absentDeduction === 0
                  ? money(0)
                  : `−${money(a.absentDeduction)}`
              }
            />
            <Line
              label="Unpaid Leave Deduction"
              value={
                a.unpaidLeaveDeduction === 0
                  ? money(0)
                  : `−${money(a.unpaidLeaveDeduction)}`
              }
            />
            <Line label="Overtime pay" value={money(a.overtimePay)} />
            <Line
              label="Gross Earnings"
              value={money(a.grossEarnings)}
              strong
            />
          </Section>
          <Section title="Deductions">
            <Line label="Provident Fund (PF)" value={money(a.pfEmployee)} />
            <Line label="ESI" value={money(a.esiEmployee)} />
            <Line label="Professional Tax" value={money(a.professionalTax)} />
            {a.otherDeductionLines
              .filter((line) => line.charged > 0)
              .map((line) => (
                <Line
                  key={line.name}
                  label={line.name}
                  value={money(line.charged)}
                />
              ))}
            <Line label="Advance Recovered" value={money(a.advanceRecovered)} />
            <Line
              label="Total Deductions"
              value={money(a.totalDeductions)}
              strong
            />
          </Section>
          <div className="bg-muted flex items-center justify-between rounded-lg px-3 py-3">
            <span className="font-medium">Net Payable</span>
            <span className="text-lg font-semibold tabular-nums">
              {money(a.netPayable)}
            </span>
          </div>
          {a.shortfall != null ? (
            <p className="text-muted-foreground text-sm">
              Not taken this month so that net pay is not negative:{" "}
              {money(
                a.shortfall.advance +
                  a.shortfall.otherDeductions +
                  a.shortfall.professionalTax,
              )}
              . An advance not recovered stays outstanding.
            </p>
          ) : null}
          <Section title="Employer contributions">
            <Line label="Employer PF (EPF)" value={money(a.pfEmployer)} />
            <Line label="Employer pension (EPS)" value={money(a.epsEmployer)} />
            <Line label="Employer ESI" value={money(a.esiEmployer)} />
          </Section>
        </>
      )}
    </>
  );
}

function AdvanceSlip({ slip }: { slip: SalarySlipModel }) {
  const advance = slip.advance;
  return (
    <Section title="Advance">
      <Line label="Amount" value={money(advance?.amount)} />
      <Line
        label="Paid on"
        value={advance == null ? "—" : formatDate(advance.advanceDate)}
      />
      <Line label="Instalments" value={String(advance?.instalments ?? 1)} />
      <Line
        label="Recovery from"
        value={advance == null ? "—" : monthLabel(advance.firstRecoveryMonth)}
      />
      <Line label="Recovered so far" value={money(advance?.recovered)} />
      {advance?.reason != null ? (
        <Line label="Reason" value={advance.reason} />
      ) : null}
    </Section>
  );
}

/**
 * One salary slip in a side sheet (CM-317): Attendance Details, Earnings,
 * Deductions and Net Payable; the payment once paid; Recalculate while
 * Calculated, and the payslip PDF once approved.
 */
export function SalarySlipSheet({
  slip,
  canRecalculate = false,
  onClose,
}: {
  slip: SalarySlipModel | null;
  canRecalculate?: boolean;
  onClose: () => void;
}) {
  const command = useSalaryCommand();
  const [problem, setProblem] = useState<string>();
  return (
    <Sheet
      open={slip != null}
      onOpenChange={(open) => {
        if (!open) {
          setProblem(undefined);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {slip?.kind === "advance" ? "Advance Salary" : "Salary Slip"}
          </SheetTitle>
          <SheetDescription>
            {slip == null
              ? ""
              : `${slip.memberName} · ${monthLabel(slip.month)}`}
          </SheetDescription>
        </SheetHeader>
        {slip != null ? (
          <div className="space-y-5 px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SalaryStatusBadge status={slip.status} />
              {slip.designationName != null ? (
                <span className="text-muted-foreground">
                  {slip.designationName}
                </span>
              ) : null}
              {slip.structureName != null ? (
                <span className="text-muted-foreground">
                  · {slip.structureName}
                </span>
              ) : null}
            </div>
            {slip.kind === "advance" ? (
              <AdvanceSlip slip={slip} />
            ) : (
              <RegularSlip slip={slip} />
            )}
            {slip.payment != null ? (
              <p className="text-sm">
                Paid by {PAYMENT_MODE_LABELS[slip.payment.mode]} on{" "}
                {formatDate(slip.payment.date)}
                {slip.payment.reference == null
                  ? ""
                  : ` · ${slip.payment.reference}`}
              </p>
            ) : null}
            <FormAlert message={problem} />
            <div className="flex flex-wrap gap-2">
              {slip.hasPayslip && slip.amountsVisible ? (
                <>
                  <a
                    href={payslipUrl(slip.id, true)}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <Eye aria-hidden="true" />
                    View payslip
                  </a>
                  <a
                    href={payslipUrl(slip.id)}
                    download
                    className={buttonVariants({ variant: "default" })}
                  >
                    <Download aria-hidden="true" />
                    Download PDF
                  </a>
                </>
              ) : null}
              {canRecalculate && slip.status === "calculated" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={command.isPending}
                  onClick={() => {
                    setProblem(undefined);
                    command.mutate(
                      { kind: "recalculate", slip },
                      {
                        onError: (error) => {
                          setProblem(fieldForCode(error, {}).message);
                        },
                      },
                    );
                  }}
                >
                  {command.isPending ? "Recalculating…" : "Recalculate"}
                </Button>
              ) : null}
            </div>
            {slip.kind === "regular" && slip.status === "calculated" ? (
              <p className="text-muted-foreground text-sm">
                The payslip is ready once this salary is approved.
              </p>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
