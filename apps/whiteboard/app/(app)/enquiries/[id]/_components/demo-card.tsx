"use client";

import { CalendarDays, UserRound, UsersRound } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";

import { formatPaiseAsRupees } from "@/lib/money";
import type { DemoResponse } from "@/src/queries/enquiries";

import { errorMessage } from "./enquiry-errors";
import { demoHasStarted, demoTitle, demoWhen } from "./enquiry-format";

export type DemoActions = {
  onMarkAttendance: (demoId: string, attended: boolean) => Promise<void>;
  onMarkPaid: (demoId: string) => Promise<void>;
  onCancel: (demoId: string) => Promise<void>;
};

const NEUTRAL = "border-border bg-muted text-muted-foreground dark:bg-muted/60";
const GOOD =
  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200";
const WARN =
  "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";

function FeeBadge({ demo }: { demo: DemoResponse }) {
  if (demo.feeKind === "free") {
    return (
      <Badge variant="outline" className={NEUTRAL}>
        Free
      </Badge>
    );
  }
  const amount = formatPaiseAsRupees(demo.feeAmountPaise ?? 0);
  return demo.feePaidAt == null ? (
    <Badge variant="outline" className={WARN}>
      {amount} · Unpaid
    </Badge>
  ) : (
    <Badge variant="outline" className={GOOD}>
      {amount} · Paid
    </Badge>
  );
}

function AttendanceBadge({
  demo,
  started,
}: {
  demo: DemoResponse;
  started: boolean;
}) {
  if (demo.cancelledAt != null) {
    return <Badge variant="destructive">Cancelled</Badge>;
  }
  if (demo.attendance === "attended") {
    return (
      <Badge variant="outline" className={GOOD}>
        Attended
      </Badge>
    );
  }
  if (demo.attendance === "missed") {
    return (
      <Badge variant="outline" className={WARN}>
        Missed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={NEUTRAL}>
      {started ? "Not marked" : "Upcoming"}
    </Badge>
  );
}

export function DemoCard({
  demo,
  actions,
  now,
  onRequestCancel,
  busy,
  onRun,
}: {
  demo: DemoResponse;
  actions?: DemoActions;
  now: Date;
  onRequestCancel: (demo: DemoResponse) => void;
  busy: boolean;
  onRun: (action: () => Promise<void>) => void;
}) {
  const cancelled = demo.cancelledAt != null;
  const started = demoHasStarted(demo, now);
  const canMark = actions != null && !cancelled && started;
  const canMarkPaid =
    actions != null &&
    !cancelled &&
    demo.feeKind === "paid" &&
    demo.feePaidAt == null;
  const canCancel =
    actions != null && !cancelled && demo.attendance === "unmarked";
  const Icon = demo.kind === "batch" ? UsersRound : UserRound;

  return (
    <li
      className={`rounded-xl border p-4 ${cancelled ? "bg-muted/30" : "bg-card"}`}
      aria-label={`${demo.kind === "batch" ? "Batch demo" : "One-to-one demo"} on ${demoWhen(demo)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {demo.kind === "batch" ? "Batch demo" : "One-to-one demo"}
            </p>
            <p
              className={`font-semibold break-words ${cancelled ? "text-muted-foreground line-through" : ""}`}
            >
              {demoTitle(demo)}
              {demo.kind === "batch" && demo.courseName ? (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {demo.courseName}
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {demoWhen(demo)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FeeBadge demo={demo} />
          <AttendanceBadge demo={demo} started={started} />
        </div>
      </div>
      {canMark || canMarkPaid || canCancel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {canMark ? (
            <>
              <Button
                type="button"
                size="sm"
                variant={demo.attendance === "attended" ? "default" : "outline"}
                aria-pressed={demo.attendance === "attended"}
                disabled={busy}
                onClick={() => {
                  if (demo.attendance === "attended") return;
                  onRun(() => actions.onMarkAttendance(demo.id, true));
                }}
              >
                Attended
              </Button>
              <Button
                type="button"
                size="sm"
                variant={demo.attendance === "missed" ? "default" : "outline"}
                aria-pressed={demo.attendance === "missed"}
                disabled={busy}
                onClick={() => {
                  if (demo.attendance === "missed") return;
                  onRun(() => actions.onMarkAttendance(demo.id, false));
                }}
              >
                Missed
              </Button>
            </>
          ) : null}
          {canMarkPaid ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                onRun(() => actions.onMarkPaid(demo.id));
              }}
            >
              Mark paid
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground sm:ml-auto"
              disabled={busy}
              onClick={() => {
                onRequestCancel(demo);
              }}
            >
              Cancel booking
            </Button>
          ) : null}
          {!started && canCancel ? (
            <span className="text-muted-foreground w-full text-xs sm:w-auto">
              Attendance can be marked once the demo starts.
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function DemoList({
  demos,
  actions,
  now = new Date(),
}: {
  demos: DemoResponse[];
  /** Omit to show demos without actions. */
  actions?: DemoActions;
  now?: Date;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<DemoResponse | null>(null);
  const run = (demoId: string, action: () => Promise<void>) => {
    setBusyId(demoId);
    setError(null);
    action()
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  if (demos.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
        No demos booked yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error == null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {demos.map((demo) => (
          <DemoCard
            key={demo.id}
            demo={demo}
            actions={actions}
            now={now}
            busy={busyId === demo.id}
            onRun={(action) => {
              run(demo.id, action);
            }}
            onRequestCancel={setPendingCancel}
          />
        ))}
      </ul>
      <AlertDialog
        open={pendingCancel != null}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this demo booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCancel == null
                ? ""
                : `${demoTitle(pendingCancel)}, ${demoWhen(pendingCancel)}. The booking stays in the history as cancelled.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingCancel == null || actions == null) return;
                const demo = pendingCancel;
                setPendingCancel(null);
                run(demo.id, () => actions.onCancel(demo.id));
              }}
            >
              Cancel booking
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
