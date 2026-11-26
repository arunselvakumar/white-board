"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";

import { isMonth, monthOf } from "@/src/preschool/domain/dashboard";
import { addMonths, todayInIndia } from "@/src/preschool/domain/dates";

/** "November 2026" */
export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The month a Head Office page shows, kept in `?month=YYYY-MM`. Never a
 * month ahead of this one.
 */
export function useReportMonth() {
  const router = useRouter();
  const pathname = usePathname() || "/preschool/head-office";
  const searchParams = useSearchParams();
  const current = monthOf(todayInIndia(new Date()));
  const [month, setMonthState] = useState(() => {
    const wanted = searchParams.get("month") ?? "";
    return isMonth(wanted) && wanted <= current ? wanted : current;
  });
  const setMonth = (next: string) => {
    const clamped = next > current ? current : next;
    setMonthState(clamped);
    const params = new URLSearchParams(searchParams.toString());
    if (clamped === current) params.delete("month");
    else params.set("month", clamped);
    const query = params.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  };
  return { month, current, setMonth };
}

export function MonthStepper({
  month,
  current,
  onChange,
}: {
  month: string;
  current: string;
  onChange: (month: string) => void;
}) {
  const shift = (by: number) => addMonths(`${month}-01`, by).slice(0, 7);
  return (
    <div
      role="group"
      aria-label="Month"
      className="flex items-center gap-1 print:hidden"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label="Previous month"
        onClick={() => {
          onChange(shift(-1));
        }}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <p aria-live="polite" className="min-w-36 text-center font-medium">
        {formatMonth(month)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label="Next month"
        disabled={month >= current}
        onClick={() => {
          onChange(shift(1));
        }}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
