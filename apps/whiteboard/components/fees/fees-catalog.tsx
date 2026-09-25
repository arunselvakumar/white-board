"use client";

import { ClipboardList, IndianRupee, Wallet } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { formatPaiseAsRupees } from "@/lib/money";
import { CatalogStat } from "@/components/catalog/catalog-chrome";

export type FeeDueRow = {
  id: string;
  studentName: string;
  batchName: string;
  remainingDuesPaise: number;
};

export function FeesCatalog({
  dues,
  onCollect,
  onOpenStudents,
}: {
  dues: FeeDueRow[];
  onCollect: (id: string) => void;
  onOpenStudents: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Fees</h1>
        <p className="text-muted-foreground text-sm">
          Follow up on remaining dues for active Enrollments.
        </p>
      </div>
      <section aria-label="Fee summary" className="grid gap-3 sm:grid-cols-3">
        <CatalogStat
          label="Enrollments with dues"
          value={dues.length}
          detail="In the current list"
          icon={ClipboardList}
          tone="violet"
        />
        <CatalogStat
          label="Remaining dues"
          value={formatPaiseAsRupees(
            dues.reduce((sum, row) => sum + row.remainingDuesPaise, 0),
          )}
          detail="Across listed Enrollments"
          icon={IndianRupee}
          tone="amber"
        />
        <CatalogStat
          label="Largest balance"
          value={formatPaiseAsRupees(
            Math.max(0, ...dues.map((row) => row.remainingDuesPaise)),
          )}
          detail="In the current list"
          icon={Wallet}
          tone="emerald"
        />
      </section>
      <section
        aria-label="Remaining dues"
        className="bg-card overflow-hidden rounded-2xl border shadow-sm"
      >
        <div className="border-b p-4 sm:px-6">
          <h2 className="font-semibold">Remaining dues</h2>
          <p className="text-muted-foreground text-xs">
            Open an Enrollment to collect a Fee Payment
          </p>
        </div>
        {dues.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyDescription>
                Remaining dues will show here after an Enrollment has a Fee
                Plan.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={onOpenStudents}>
                Open Students
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs tracking-wide uppercase">
                  Student
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Batch
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Remaining dues
                </TableHead>
                <TableHead className="pr-6 text-right text-xs tracking-wide uppercase">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dues.map((row) => (
                <TableRow
                  key={row.id}
                  className="h-19 hover:bg-violet-50/60 dark:hover:bg-violet-400/5"
                >
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 font-semibold text-rose-700 dark:bg-rose-400/20 dark:text-rose-200"
                        aria-hidden="true"
                      >
                        {row.studentName.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="font-semibold">{row.studentName}</span>
                    </div>
                  </TableCell>
                  <TableCell>{row.batchName}</TableCell>
                  <TableCell className="font-semibold text-amber-700 tabular-nums dark:text-amber-200">
                    {formatPaiseAsRupees(row.remainingDuesPaise)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onCollect(row.id);
                      }}
                    >
                      Collect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
