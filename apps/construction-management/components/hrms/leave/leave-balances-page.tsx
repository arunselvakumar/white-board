"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarPlus, RefreshCw, Scale } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FormAlert } from "@/components/auth/form-alert";
import { MasterEmpty } from "@/components/masters/master-list-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  leaveOptionsQuery,
  leaveStructuresQuery,
  leaveTypesQuery,
  teamLeaveBalancesQuery,
  useLeaveCommand,
  type MemberLeaveBalances,
} from "@/src/queries/hrms-leave";

import {
  AdjustBalanceDialog,
  CreditHistorySheet,
  InitialiseBalancesDialog,
} from "./leave-balance-dialogs";
import { formatDays, leaveYearChoices } from "./leave-format";

/**
 * Configuration → Leave Balances (CM-311): every Team Member's balances
 * for a leave year, with Initialise, Accrue now and Adjust (Comp Off) for
 * those who manage leave structures.
 */
export function LeaveBalancesPage() {
  const { data: options } = useSuspenseQuery(leaveOptionsQuery);
  if (!options.permissions.viewTeam)
    return (
      <div className="w-full p-6">
        <div className="w-full max-w-4xl space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Leave Balances
          </h2>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Scale />
              </EmptyMedia>
              <EmptyTitle>Team balances are not shared with you</EmptyTitle>
              <EmptyDescription>
                Seeing everyone&apos;s balances needs View All on Leave
                Management. Your own balances are on My Leaves.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  return <TeamBalances canManage={options.permissions.manageBalances} />;
}

function TeamBalances({ canManage }: { canManage: boolean }) {
  const [leaveYear, setLeaveYear] = useState<string | undefined>();
  const { data } = useSuspenseQuery(teamLeaveBalancesQuery(leaveYear));
  const { data: options } = useSuspenseQuery(leaveOptionsQuery);
  const command = useLeaveCommand();
  const [initialising, setInitialising] = useState(false);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [history, setHistory] = useState<MemberLeaveBalances | null>(null);
  const [status, setStatus] = useState<string>("");
  const [problem, setProblem] = useState<string | undefined>();

  const year = data.leaveYear;
  const yearItems = leaveYearChoices(leaveYear ?? year).map((value) => ({
    value,
    label: value,
  }));

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Leave Balances
            </h2>
            <p className="text-muted-foreground text-sm">
              What each Team Member can still take, from their credits and leave
              taken.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="leave-balances-year" className="text-xs">
              Leave year
            </Label>
            <Select
              items={yearItems}
              value={year}
              onValueChange={(value) => {
                if (value != null) setLeaveYear(value);
              }}
            >
              <SelectTrigger id="leave-balances-year" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                aria-label="Leave years"
              >
                {yearItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setStatus("");
                setInitialising(true);
              }}
            >
              <CalendarPlus aria-hidden="true" />
              Initialise
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={command.isPending}
              onClick={() => {
                setStatus("");
                setProblem(undefined);
                command.mutate(
                  { kind: "accrue", leaveYear: year },
                  {
                    onSuccess: (result) => {
                      const credits =
                        result != null && "credits" in result
                          ? result.credits
                          : 0;
                      setStatus(
                        credits === 0
                          ? "Every monthly credit due is already posted."
                          : `Posted ${String(credits)} monthly credits.`,
                      );
                    },
                    onError: (error) => {
                      setProblem(fieldForCode(error, {}).message);
                    },
                  },
                );
              }}
            >
              <RefreshCw aria-hidden="true" />
              {command.isPending ? "Accruing…" : "Accrue now"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("");
                setAdjusting("any");
              }}
            >
              Adjust
            </Button>
          </div>
        ) : null}
        <p role="status" className="text-muted-foreground text-sm">
          {status}
        </p>
        <FormAlert message={problem} />

        {data.members.length === 0 ? (
          <MasterEmpty
            icon={Scale}
            title="No Team Members yet"
            description="Balances appear here once Team Members have joined."
            action={null}
          />
        ) : (
          <ul aria-label="Team balances" className="grid gap-3 md:grid-cols-2">
            {data.members.map((member) => (
              <li
                key={member.memberId}
                className="bg-card space-y-3 rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.memberName}</p>
                    {member.designationName != null ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {member.designationName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setHistory(member);
                      }}
                    >
                      History
                    </Button>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStatus("");
                          setAdjusting(member.memberId);
                        }}
                      >
                        Adjust
                      </Button>
                    ) : null}
                  </div>
                </div>
                {member.rows.some((row) => row.initialised) ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {member.rows.map((row) => (
                      <div key={row.leaveTypeId} className="contents">
                        <dt className="text-muted-foreground truncate">
                          {row.leaveTypeName}
                        </dt>
                        <dd className="text-right tabular-nums">
                          {row.isPaid
                            ? `${formatDays(row.available)}${row.pending > 0 ? ` (${formatDays(row.pending)} pending)` : ""}`
                            : `${formatDays(row.used)} taken`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Not initialised for {year}.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canManage ? (
        <BalanceDialogs
          year={year}
          initialising={initialising}
          adjusting={adjusting}
          members={options.members}
          onCloseInitialise={() => {
            setInitialising(false);
          }}
          onCloseAdjust={() => {
            setAdjusting(null);
          }}
          onDone={(message) => {
            setInitialising(false);
            setAdjusting(null);
            setStatus(message);
          }}
        />
      ) : null}
      <CreditHistorySheet
        member={
          history == null
            ? null
            : { memberId: history.memberId, name: history.memberName }
        }
        leaveYear={year}
        onClose={() => {
          setHistory(null);
        }}
      />
    </div>
  );
}

function BalanceDialogs({
  year,
  initialising,
  adjusting,
  members,
  onCloseInitialise,
  onCloseAdjust,
  onDone,
}: {
  year: string;
  initialising: boolean;
  adjusting: string | null;
  members: { memberId: string; name: string; designationName: string | null }[];
  onCloseInitialise: () => void;
  onCloseAdjust: () => void;
  onDone: (message: string) => void;
}) {
  const { data: structures } = useSuspenseQuery(leaveStructuresQuery);
  const { data: types } = useSuspenseQuery(leaveTypesQuery);
  return (
    <>
      <InitialiseBalancesDialog
        open={initialising}
        leaveYear={year}
        members={members}
        structures={structures.items}
        onClose={onCloseInitialise}
        onDone={onDone}
      />
      <AdjustBalanceDialog
        open={adjusting != null}
        leaveYear={year}
        members={members}
        leaveTypes={types.items}
        initialMemberId={adjusting === "any" ? null : adjusting}
        onClose={onCloseAdjust}
        onDone={onDone}
      />
    </>
  );
}
