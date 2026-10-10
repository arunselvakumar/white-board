"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, History } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";

import { MasterSearch } from "@/components/masters/master-list-parts";
import { HRMS_PATH } from "@/lib/hrms-nav";
import {
  hrmsRotationTemplatesQuery,
  hrmsShiftAssignmentsQuery,
  hrmsShiftTemplatesQuery,
  type HrmsMemberAssignments,
  type HrmsShiftAssignment,
} from "@/src/queries/hrms-shifts";

import { AssignShiftDialog } from "./assign-shift-dialog";
import { HrmsEmpty, HrmsPage, formatDate } from "./hrms-parts";

function kindLabel(assignment: HrmsShiftAssignment): string {
  return assignment.kind === "shift" ? "shift" : "rotation";
}

function currentLine(item: HrmsMemberAssignments): string {
  if (item.current == null) return "Standard day from HRMS Settings";
  return `${item.current.templateName} (${kindLabel(item.current)}) since ${formatDate(item.current.effectiveFrom)}`;
}

function HistoryDialog({
  item,
  onClose,
}: {
  item: HrmsMemberAssignments;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shift history of {item.member.name}</DialogTitle>
          <DialogDescription>
            Newest first. Before the first one, the HRMS Settings day applied.
          </DialogDescription>
        </DialogHeader>
        {item.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No shift assigned yet; the HRMS Settings day applies.
          </p>
        ) : (
          <ol aria-label="Shift history" className="divide-y rounded-lg border">
            {item.history.map((entry) => (
              <li key={entry.id} className="space-y-0.5 px-3 py-2.5">
                <p className="font-medium">
                  {entry.templateName}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({kindLabel(entry)})
                  </span>
                </p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {formatDate(entry.effectiveFrom)} –{" "}
                  {entry.effectiveTo == null
                    ? "until changed"
                    : formatDate(entry.effectiveTo)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Configuration → Shift Management (CM-307): every Team Member's shift or
 * rotation today, what is planned, and the history; select members and
 * assign a shift or a rotation from a date, until changed. Menu
 * `hrms.shifts`.
 */
export function ShiftManagementPage() {
  const { data } = useSuspenseQuery(hrmsShiftAssignmentsQuery);
  const { data: shifts } = useSuspenseQuery(hrmsShiftTemplatesQuery);
  const { data: rotations } = useSuspenseQuery(hrmsRotationTemplatesQuery);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [history, setHistory] = useState<HrmsMemberAssignments | null>(null);
  const [notice, setNotice] = useState("");

  const activeShifts = shifts.items.filter((item) => item.isActive);
  const activeRotations = rotations.items.filter((item) => item.isActive);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items.filter((item) =>
      item.member.name.toLowerCase().includes(needle),
    );
  }, [data.items, query]);
  const allShown =
    shown.length > 0 &&
    shown.every((item) => chosen.includes(item.member.memberId));

  if (activeShifts.length === 0 && activeRotations.length === 0)
    return (
      <HrmsPage
        title="Shift Management"
        description="Who works which shift or rotation, until changed."
      >
        <HrmsEmpty
          icon={CalendarClock}
          title="No active shifts or rotations"
          description="Everyone works the standard day from HRMS Settings. Add a shift or a rotation first, then assign it here."
          action={
            <Link
              href={`${HRMS_PATH}/configuration/shifts`}
              className={buttonVariants()}
            >
              Go to Shifts
            </Link>
          }
        />
      </HrmsPage>
    );

  const toggle = (memberId: string, on: boolean) => {
    setChosen((current) =>
      on
        ? [...new Set([...current, memberId])]
        : current.filter((id) => id !== memberId),
    );
  };

  return (
    <HrmsPage
      title="Shift Management"
      description="Who works which shift or rotation, until changed. Members without one work the standard day from HRMS Settings."
      actions={
        <Button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => {
            setNotice("");
            setAssigning(true);
          }}
        >
          <CalendarClock aria-hidden="true" />
          {chosen.length === 0
            ? "Assign shift"
            : `Assign shift (${String(chosen.length)})`}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MasterSearch
          label="Search Team Members"
          value={query}
          onChange={setQuery}
        />
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={allShown}
            onCheckedChange={(next) => {
              for (const item of shown) toggle(item.member.memberId, next);
            }}
          />
          Select all shown
        </Label>
      </div>
      <p role="status" className="text-muted-foreground text-sm">
        {notice}
      </p>
      {shown.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          No Team Member matches “{query.trim()}”.
        </p>
      ) : (
        <ul
          aria-label="Team Members"
          className="bg-card divide-y rounded-xl border"
        >
          {shown.map((item) => {
            const id = `assign-member-${item.member.memberId}`;
            return (
              <li
                key={item.member.memberId}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Checkbox
                  id={id}
                  checked={chosen.includes(item.member.memberId)}
                  onCheckedChange={(next) => {
                    toggle(item.member.memberId, next);
                  }}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={id} className="block truncate font-medium">
                    {item.member.name}
                    {item.member.designationName == null ? null : (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {item.member.designationName}
                      </span>
                    )}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {currentLine(item)}
                  </p>
                  {item.upcoming == null ? null : (
                    <p className="text-sm">
                      From {formatDate(item.upcoming.effectiveFrom)}:{" "}
                      {item.upcoming.templateName} ({kindLabel(item.upcoming)})
                    </p>
                  )}
                  {item.member.memberType === "hrms" || !item.member.active ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.member.memberType === "hrms" ? (
                        <Badge variant="secondary">HRMS</Badge>
                      ) : null}
                      {item.member.active ? null : (
                        <Badge variant="outline">Joining Pending</Badge>
                      )}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`History of ${item.member.name}`}
                  onClick={() => {
                    setHistory(item);
                  }}
                >
                  <History />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {assigning ? (
        <AssignShiftDialog
          members={data.items
            .filter((item) => chosen.includes(item.member.memberId))
            .map((item) => item.member)}
          shifts={activeShifts}
          rotations={activeRotations}
          today={data.today}
          onClose={() => {
            setAssigning(false);
          }}
          onAssigned={() => {
            setNotice(
              `Assigned to ${String(chosen.length)} ${chosen.length === 1 ? "Team Member" : "Team Members"}.`,
            );
            setChosen([]);
            setAssigning(false);
          }}
        />
      ) : null}
      {history == null ? null : (
        <HistoryDialog
          item={history}
          onClose={() => {
            setHistory(null);
          }}
        />
      )}
    </HrmsPage>
  );
}
