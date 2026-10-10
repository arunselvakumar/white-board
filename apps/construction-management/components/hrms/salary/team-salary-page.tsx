"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  IndianRupee,
  Wallet,
} from "lucide-react";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { HrmsEmpty } from "@/components/hrms/hrms-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  teamSalariesQuery,
  teamSalaryReportUrl,
  useSalaryCommand,
  type SalarySlipModel,
  type TeamSalaries,
} from "@/src/queries/hrms-salary";

import {
  MarkPaidDialog,
  PayAdvanceDialog,
  type AdvanceMember,
} from "./salary-dialogs";
import {
  days,
  formatDate,
  localToday,
  money,
  monthLabel,
  shiftMonth,
} from "./salary-format";
import { SalarySlipSheet, SalaryStatusBadge } from "./salary-slip-sheet";

/**
 * Team Salary (CM-317): a month's salaries for everyone. Calculate the
 * month, read each member's slip, approve the Calculated ones you select
 * (approving closes the member's month for attendance and leave), mark
 * Approved ones paid, pay an advance, and download the team report.
 */
export function TeamSalaryPage({ today }: { today?: string }) {
  const now = today ?? localToday();
  // Salaries are usually run for the month just ended.
  const [month, setMonth] = useState(shiftMonth(now.slice(0, 7), -1));
  const current = now.slice(0, 7);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Team Salary
            </h2>
            <p className="text-muted-foreground text-sm">
              Calculate, approve and pay the month&apos;s salaries.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => {
                setMonth(shiftMonth(month, -1));
              }}
            >
              <ChevronLeft />
            </Button>
            <p
              className="w-36 text-center text-sm font-medium"
              aria-live="polite"
            >
              {monthLabel(month)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next month"
              disabled={month >= current}
              onClick={() => {
                setMonth(shiftMonth(month, 1));
              }}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <Suspense
          fallback={
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          }
        >
          <Month key={month} month={month} today={now} />
        </Suspense>
      </div>
    </div>
  );
}

function Totals({ totals }: { totals: NonNullable<TeamSalaries["totals"]> }) {
  const cells = [
    { label: "Gross", value: totals.grossEarnings },
    { label: "Deductions", value: totals.deductions },
    { label: "Net payable", value: totals.netPayable },
    { label: "Employer PF / ESI", value: totals.employerContributions },
  ];
  return (
    <dl
      aria-label="Month totals"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card rounded-xl border px-4 py-3">
          <dt className="text-muted-foreground text-xs">{cell.label}</dt>
          <dd className="font-semibold tabular-nums">{money(cell.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Month({ month, today }: { month: string; today: string }) {
  const { data } = useSuspenseQuery(teamSalariesQuery(month));
  if (data == null)
    return (
      <HrmsEmpty
        icon={IndianRupee}
        title="Team salary is not shared with you"
        description="Seeing everyone's salary needs View All on Salary Management. Your own payslips are in My Salary."
      />
    );
  return <MonthSalaries data={data} month={month} today={today} />;
}

function MonthSalaries({
  data,
  month,
  today,
}: {
  data: TeamSalaries;
  month: string;
  today: string;
}) {
  const command = useSalaryCommand();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"paid" | "advance" | null>(null);
  const [notice, setNotice] = useState<string>();
  const [problem, setProblem] = useState<string>();

  const regular = data.items.filter((slip) => slip.kind === "regular");
  const advances = data.items.filter((slip) => slip.kind === "advance");
  const open = data.items.find((slip) => slip.id === openId) ?? null;
  const can = data.can;
  const actionable = (slip: SalarySlipModel) =>
    (can.approve && slip.status === "calculated") ||
    (can.markPaid && slip.status === "approved");
  const chosen = regular.filter((slip) => selected.has(slip.id));
  const toApprove = chosen.filter((slip) => slip.status === "calculated");
  const toPay = chosen.filter((slip) => slip.status === "approved");
  const selectable = regular.filter(actionable);
  const allChosen =
    selectable.length > 0 && selectable.every((slip) => selected.has(slip.id));
  const advanceMembers: AdvanceMember[] = [
    ...regular.map((slip) => ({
      memberId: slip.memberId,
      name: slip.memberName,
      designationName: slip.designationName,
    })),
    ...data.skipped
      .filter((item) => item.reason === "not_calculated")
      .map((item) => ({
        memberId: item.memberId,
        name: item.name,
        designationName: item.designationName,
      })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const run = (
    work: Parameters<typeof command.mutate>[0],
    done: (result: unknown) => string,
  ) => {
    setNotice(undefined);
    setProblem(undefined);
    command.mutate(work, {
      onSuccess: (result) => {
        setSelected(new Set());
        setNotice(done(result));
      },
      onError: (error) => {
        setProblem(fieldForCode(error, {}).message);
      },
    });
  };

  const calculate = () => {
    run({ kind: "calculate", month }, (result) => {
      const r = result as {
        calculated: number;
        kept: number;
        skipped: unknown[];
      };
      return `Calculated ${String(r.calculated)} ${r.calculated === 1 ? "salary" : "salaries"}${r.kept > 0 ? `, kept ${String(r.kept)} approved` : ""}${r.skipped.length > 0 ? `, ${String(r.skipped.length)} not calculated` : ""}.`;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {can.calculate ? (
          <Button
            type="button"
            disabled={command.isPending}
            onClick={calculate}
          >
            {command.isPending && command.variables.kind === "calculate"
              ? "Calculating…"
              : "Calculate Salary"}
          </Button>
        ) : null}
        {can.payAdvance ? (
          <Button
            type="button"
            variant="outline"
            disabled={advanceMembers.length === 0}
            onClick={() => {
              setNotice(undefined);
              setDialog("advance");
            }}
          >
            <Wallet aria-hidden="true" />
            Pay Advance
          </Button>
        ) : null}
        {can.report ? (
          <a
            href={teamSalaryReportUrl(month)}
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Excel
          </a>
        ) : null}
      </div>
      {notice != null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      ) : null}
      <FormAlert message={problem} />
      {data.totals != null && data.totals.slips > 0 ? (
        <Totals totals={data.totals} />
      ) : null}

      {regular.length === 0 ? (
        <HrmsEmpty
          icon={IndianRupee}
          title={`No salaries for ${monthLabel(month)}`}
          description={
            can.calculate
              ? "Calculate the month to work out everyone's salary from attendance and leave."
              : "Salaries for this month have not been calculated yet."
          }
        />
      ) : (
        <section aria-label="Salaries" className="space-y-2">
          {selectable.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="salary-select-all"
                  checked={allChosen}
                  onCheckedChange={(checked) => {
                    setSelected(
                      checked
                        ? new Set(selectable.map((slip) => slip.id))
                        : new Set(),
                    );
                  }}
                />
                <label htmlFor="salary-select-all" className="text-sm">
                  Select all
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {can.approve ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={toApprove.length === 0 || command.isPending}
                    onClick={() => {
                      run({ kind: "approve", slips: toApprove }, () =>
                        toApprove.length === 1
                          ? "Approved 1 salary. Its month is now closed for attendance and leave."
                          : `Approved ${String(toApprove.length)} salaries. Their month is now closed for attendance and leave.`,
                      );
                    }}
                  >
                    Approve ({String(toApprove.length)})
                  </Button>
                ) : null}
                {can.markPaid ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={toPay.length === 0 || command.isPending}
                    onClick={() => {
                      setNotice(undefined);
                      setDialog("paid");
                    }}
                  >
                    Mark Paid ({String(toPay.length)})
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <ul className="bg-card divide-y rounded-xl border">
            {regular.map((slip) => (
              <SlipRow
                key={slip.id}
                slip={slip}
                selectable={actionable(slip)}
                checked={selected.has(slip.id)}
                onCheck={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(slip.id);
                  else next.delete(slip.id);
                  setSelected(next);
                }}
                onOpen={() => {
                  setOpenId(slip.id);
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {advances.length > 0 ? (
        <section aria-label="Advances paid" className="space-y-2">
          <h3 className="text-sm font-medium">Advances paid</h3>
          <ul className="bg-card divide-y rounded-xl border">
            {advances.map((slip) => (
              <li key={slip.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between gap-3 rounded-none px-4 py-3 font-normal whitespace-normal"
                  onClick={() => {
                    setOpenId(slip.id);
                  }}
                >
                  <span className="min-w-0 text-left">
                    <span className="block truncate font-medium">
                      {slip.memberName}
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      {slip.advance == null
                        ? ""
                        : `${formatDate(slip.advance.advanceDate)} · ${String(slip.advance.instalments)} ${slip.advance.instalments === 1 ? "instalment" : "instalments"}`}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {money(slip.advance?.amount)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.skipped.length > 0 ? (
        <section aria-label="Not calculated" className="space-y-2">
          <h3 className="text-sm font-medium">Not calculated</h3>
          <ul className="bg-card divide-y rounded-xl border">
            {data.skipped.map((item) => (
              <li
                key={item.memberId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.name}
                  </span>
                  {item.designationName != null ? (
                    <span className="text-muted-foreground block text-sm">
                      {item.designationName}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-sm">
                  {item.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SalarySlipSheet
        slip={open}
        canRecalculate={can.calculate}
        onClose={() => {
          setOpenId(null);
        }}
      />
      <MarkPaidDialog
        open={dialog === "paid"}
        slips={toPay}
        today={today}
        onClose={() => {
          setDialog(null);
        }}
        onDone={(message) => {
          setDialog(null);
          setSelected(new Set());
          setNotice(message);
        }}
      />
      <PayAdvanceDialog
        open={dialog === "advance"}
        members={advanceMembers}
        today={today}
        onClose={() => {
          setDialog(null);
        }}
        onDone={(message) => {
          setDialog(null);
          setNotice(message);
        }}
      />
    </div>
  );
}

function SlipRow({
  slip,
  selectable,
  checked,
  onCheck,
  onOpen,
}: {
  slip: SalarySlipModel;
  selectable: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const a = slip.amounts;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="w-4 pt-1">
        {selectable ? (
          <Checkbox
            aria-label={`Select ${slip.memberName}`}
            checked={checked}
            onCheckedChange={(next) => {
              onCheck(next);
            }}
          />
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="-m-2 h-auto min-w-0 flex-1 flex-col items-stretch gap-1.5 p-2 text-left font-normal whitespace-normal"
        aria-label={`${slip.memberName}, ${slip.status}, net ${money(a?.netPayable)}`}
        onClick={onOpen}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {slip.memberName}
            </span>
            <span className="text-muted-foreground block text-sm">
              {days(slip.days.payable)} payable
              {slip.designationName == null ? "" : ` · ${slip.designationName}`}
            </span>
          </span>
          <SalaryStatusBadge status={slip.status} />
        </span>
        <span className="grid grid-cols-3 gap-2 text-sm">
          <span>
            <span className="text-muted-foreground block text-xs">Gross</span>
            <span className="tabular-nums">{money(a?.grossEarnings)}</span>
          </span>
          <span>
            <span className="text-muted-foreground block text-xs">
              Deductions
            </span>
            <span className="tabular-nums">{money(a?.totalDeductions)}</span>
          </span>
          <span>
            <span className="text-muted-foreground block text-xs">Net</span>
            <span className="font-medium tabular-nums">
              {money(a?.netPayable)}
            </span>
          </span>
        </span>
      </Button>
    </li>
  );
}
