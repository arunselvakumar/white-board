"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, Receipt } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { HrmsEmpty, HrmsPage } from "@/components/hrms/hrms-parts";
import { mySalariesQuery, payslipUrl } from "@/src/queries/hrms-salary";

import { formatDate, money, monthLabel } from "./salary-format";
import { SalarySlipSheet, SalaryStatusBadge } from "./salary-slip-sheet";

/**
 * My Salary (CM-317): the caller's salaries once approved, newest month
 * first, with the payslip to view or download, and any advance paid.
 */
export function MySalaryPage() {
  const { data } = useSuspenseQuery(mySalariesQuery);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data.items.find((slip) => slip.id === openId) ?? null;
  return (
    <HrmsPage
      title="My Salary"
      description="Your salary month by month, once it is approved."
    >
      {data.items.length === 0 ? (
        <HrmsEmpty
          icon={Receipt}
          title="No salary slips yet"
          description="Your payslip appears here once your salary for a month is approved."
        />
      ) : (
        <ul
          aria-label="My salaries"
          className="bg-card divide-y rounded-xl border"
        >
          {data.items.map((slip) => (
            <li
              key={slip.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <Button
                type="button"
                variant="ghost"
                className="-m-2 h-auto min-w-0 flex-1 justify-between gap-3 p-2 text-left font-normal whitespace-normal"
                aria-label={`${slip.kind === "advance" ? "Advance" : "Salary"} for ${monthLabel(slip.month)}`}
                onClick={() => {
                  setOpenId(slip.id);
                }}
              >
                <span className="min-w-0 space-y-1">
                  <span className="block font-medium">
                    {slip.kind === "advance"
                      ? `Advance · ${slip.advance == null ? monthLabel(slip.month) : formatDate(slip.advance.advanceDate)}`
                      : monthLabel(slip.month)}
                  </span>
                  <SalaryStatusBadge status={slip.status} />
                </span>
                <span className="text-right">
                  <span className="text-muted-foreground block text-xs">
                    {slip.kind === "advance" ? "Advance" : "Net payable"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(
                      slip.kind === "advance"
                        ? slip.advance?.amount
                        : slip.amounts?.netPayable,
                    )}
                  </span>
                </span>
              </Button>
              {slip.hasPayslip ? (
                <a
                  href={payslipUrl(slip.id)}
                  download
                  aria-label={`Download payslip for ${monthLabel(slip.month)}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download aria-hidden="true" />
                  Payslip
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <SalarySlipSheet
        slip={open}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </HrmsPage>
  );
}
