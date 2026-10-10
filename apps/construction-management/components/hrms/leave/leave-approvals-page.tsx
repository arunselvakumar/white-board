"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import {
  leaveApprovalsQuery,
  leaveOptionsQuery,
  type LeaveApprovalTab,
} from "@/src/queries/hrms-leave";

import {
  LeaveDecisionDialog,
  LeaveDetailSheet,
  LeaveRequestRow,
  type Decision,
} from "./leave-request-parts";

const TABS: { value: LeaveApprovalTab; label: string; empty: string }[] = [
  {
    value: "pending",
    label: "Pending",
    empty: "No leave is waiting for a decision.",
  },
  { value: "approved", label: "Approved", empty: "No approved leave yet." },
  { value: "rejected", label: "Rejected", empty: "No rejected leave." },
  {
    value: "cancel_requests",
    label: "Cancel Requests",
    empty: "Nobody has asked to cancel approved leave.",
  },
];

function Nothing({
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
          <ListChecks />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * Leave Approvals (CM-313): Pending / Approved / Rejected / Cancel
 * Requests. Approve with remarks, reject with a reason, decide
 * cancellations. Your own requests wait for another approver.
 */
export function LeaveApprovalsPage({
  initialTab = "pending",
}: {
  initialTab?: LeaveApprovalTab;
}) {
  const { data: options } = useSuspenseQuery(leaveOptionsQuery);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Leave Approvals
          </h2>
          <p className="text-muted-foreground text-sm">
            Requests and cancellation requests from your team.
          </p>
        </div>
        {options.permissions.approve ? (
          <ApprovalTabs initialTab={initialTab} />
        ) : (
          <Nothing
            title="Approvals are not shared with you"
            description="Deciding leave needs Approve or Reject on Leave Management in your Permission Matrix."
          />
        )}
      </div>
    </div>
  );
}

function ApprovalTabs({ initialTab }: { initialTab: LeaveApprovalTab }) {
  const [tab, setTab] = useState<LeaveApprovalTab>(initialTab);
  const { data: pending } = useSuspenseQuery(leaveApprovalsQuery("pending"));
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as LeaveApprovalTab);
      }}
      className="gap-4"
    >
      <div className="-mx-6 overflow-x-auto px-6 [contain:inline-size]">
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
              {item.value !== "approved" && item.value !== "rejected"
                ? ` (${String(pending.counts[item.value])})`
                : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {TABS.map((item) => (
        <TabsContent key={item.value} value={item.value}>
          {tab === item.value ? (
            <ApprovalList tab={item.value} empty={item.empty} />
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ApprovalList({
  tab,
  empty,
}: {
  tab: LeaveApprovalTab;
  empty: string;
}) {
  const { data } = useSuspenseQuery(leaveApprovalsQuery(tab));
  const [decision, setDecision] = useState<Decision | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data.items.find((item) => item.id === openId) ?? null;

  if (data.items.length === 0)
    return <Nothing title="Nothing here" description={empty} />;

  return (
    <>
      <ul
        aria-label="Leave requests"
        className="bg-card divide-y rounded-xl border"
      >
        {data.items.map((leave) => (
          <LeaveRequestRow
            key={leave.id}
            leave={leave}
            showMember
            onOpen={() => {
              setOpenId(leave.id);
            }}
            actions={
              leave.canDecide ? (
                tab === "pending" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setDecision({ kind: "approve", leave });
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDecision({ kind: "reject", leave });
                      }}
                    >
                      Reject
                    </Button>
                  </>
                ) : tab === "cancel_requests" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setDecision({ kind: "approve-cancellation", leave });
                      }}
                    >
                      Approve cancellation
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDecision({ kind: "reject-cancellation", leave });
                      }}
                    >
                      Refuse
                    </Button>
                  </>
                ) : null
              ) : tab === "pending" || tab === "cancel_requests" ? (
                <span className="text-muted-foreground text-xs">
                  Another approver decides this
                </span>
              ) : null
            }
          />
        ))}
      </ul>
      <LeaveDecisionDialog
        decision={decision}
        onClose={() => {
          setDecision(null);
        }}
      />
      <LeaveDetailSheet
        leave={open}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </>
  );
}
