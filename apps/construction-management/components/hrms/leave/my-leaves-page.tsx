"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarOff, History, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import {
  leaveBalancesQuery,
  leaveOptionsQuery,
  myLeavesQuery,
  type LeaveOptions,
  type LeaveRequestModel,
} from "@/src/queries/hrms-leave";

import { ApplyLeaveDialog } from "./apply-leave-dialog";
import { CreditHistorySheet } from "./leave-balance-dialogs";
import { formatDays, localToday } from "./leave-format";
import { LeaveDetailSheet, LeaveRequestRow } from "./leave-request-parts";

function NotShared({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarOff />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * My Leaves (CM-313): your balance of each leave type, Apply Leave, your
 * requests with their details, credit history, and Request Cancellation.
 */
export function MyLeavesPage({ today }: { today?: string }) {
  const { data: options } = useSuspenseQuery(leaveOptionsQuery);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        {!options.permissions.read ? (
          <>
            <h2 className="text-xl font-semibold tracking-tight">My Leaves</h2>
            <NotShared
              title="Leave is not shared with you"
              description="Seeing and applying for leave needs Leave Management in your Permission Matrix. Ask the Owner."
            />
          </>
        ) : options.me == null ? (
          <>
            <h2 className="text-xl font-semibold tracking-tight">My Leaves</h2>
            <NotShared
              title="You are not a Team Member here"
              description="Leave belongs to Team Members of this Company."
            />
          </>
        ) : (
          <MyLeaves options={options} today={today ?? localToday()} />
        )}
      </div>
    </div>
  );
}

function MyLeaves({
  options,
  today,
}: {
  options: LeaveOptions;
  today: string;
}) {
  const { data: balances } = useSuspenseQuery(leaveBalancesQuery());
  const { data: requests } = useSuspenseQuery(myLeavesQuery);
  const [applying, setApplying] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const open = requests.items.find((item) => item.id === openId) ?? null;
  const canApply =
    options.permissions.apply || options.permissions.applyForOthers;

  const applyButton = canApply ? (
    <Button
      type="button"
      onClick={() => {
        setStatus("");
        setApplying(true);
      }}
    >
      <Plus aria-hidden="true" />
      Apply Leave
    </Button>
  ) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">My Leaves</h2>
          <p className="text-muted-foreground text-sm">
            Leave year {balances.leaveYear}. Holidays and week offs are never
            counted as leave.
          </p>
        </div>
        {applyButton}
      </div>
      <p role="status" className="text-muted-foreground text-sm">
        {status}
      </p>

      <section aria-labelledby="my-leave-balances" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="my-leave-balances" className="text-lg font-semibold">
            Balances
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setHistoryOpen(true);
            }}
          >
            <History aria-hidden="true" />
            Credit history
          </Button>
        </div>
        {balances.rows.some((row) => row.initialised) ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {balances.rows.map((row) => (
              <li
                key={row.leaveTypeId}
                className="bg-card space-y-1 rounded-xl border p-3"
              >
                <p className="text-muted-foreground truncate text-sm">
                  {row.leaveTypeName}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {row.isPaid
                    ? formatDays(row.available)
                    : `${formatDays(row.used)} taken`}
                </p>
                {row.isPaid ? (
                  <p className="text-muted-foreground text-xs">
                    {formatDays(row.used)} taken
                    {row.pending > 0
                      ? ` · ${formatDays(row.pending)} pending`
                      : ""}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">Unpaid</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Your leave balances for {balances.leaveYear} are not open yet. Your
            manager opens them from Leave Balances.
          </p>
        )}
      </section>

      <section aria-labelledby="my-leave-requests" className="space-y-3">
        <h3 id="my-leave-requests" className="text-lg font-semibold">
          Requests
        </h3>
        {requests.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarOff />
              </EmptyMedia>
              <EmptyTitle>No leave requests yet</EmptyTitle>
              <EmptyDescription>
                Leave you apply for shows here with its status.
              </EmptyDescription>
            </EmptyHeader>
            {applyButton != null ? (
              <EmptyContent>{applyButton}</EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <ul
            aria-label="My leave requests"
            className="bg-card divide-y rounded-xl border"
          >
            {requests.items.map((leave) => (
              <LeaveRequestRow
                key={leave.id}
                leave={leave}
                showMember={leave.appliedByMemberId !== leave.memberId}
                onOpen={() => {
                  setOpenId(leave.id);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <ApplyLeaveDialog
        open={applying}
        options={options}
        today={today}
        onClose={() => {
          setApplying(false);
        }}
        onApplied={(leave: LeaveRequestModel) => {
          setStatus(
            leave.status === "approved"
              ? `${leave.leaveTypeName} approved for ${formatDays(leave.totalDays)}.`
              : `${leave.leaveTypeName} for ${formatDays(leave.totalDays)} sent for approval.`,
          );
        }}
      />
      <LeaveDetailSheet
        leave={open}
        onClose={() => {
          setOpenId(null);
        }}
      />
      <CreditHistorySheet
        member={
          historyOpen ? { memberId: null, name: options.me?.name ?? "" } : null
        }
        leaveYear={balances.leaveYear}
        onClose={() => {
          setHistoryOpen(false);
        }}
      />
    </>
  );
}
