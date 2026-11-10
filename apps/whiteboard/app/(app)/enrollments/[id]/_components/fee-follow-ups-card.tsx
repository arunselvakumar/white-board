"use client";

import { Suspense, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { dashboardQueries } from "@/src/queries/dashboard";
import {
  editFeeFollowUp,
  feeDuesQueries,
  logFeeFollowUp,
  markFeeFollowUpDone,
  type FeeFollowUpInput,
  type FeeFollowUpResponse,
} from "@/src/queries/fee-dues";
import { invalidateRegisterQueries } from "@/src/queries/invalidate-register";

import { FeeFollowUpForm } from "./fee-follow-up-form";
import {
  feeFollowUpErrorMessage,
  followUpDateLabel,
  isFeeFollowUpCode,
  todayInZone,
} from "./fee-follow-up-format";
import { FeeFollowUpHistory } from "./fee-follow-up-history";

const HEADING_ID = "fee-follow-ups-heading";

/** The Owner's Fee Follow-ups for one Enrollment: log one, and the history. */
export function FeeFollowUpsCard({
  enrollmentId,
  timezone,
}: {
  enrollmentId: string;
  /** The Batch's timezone; "today" for the next follow-up date is its day. */
  timezone: string;
}) {
  return (
    <section aria-labelledby={HEADING_ID} className="space-y-3">
      <h2 id={HEADING_ID} className="text-lg tracking-tight">
        Fee Follow-ups
      </h2>
      <Suspense fallback={<FeeFollowUpsFallback />}>
        <FeeFollowUps enrollmentId={enrollmentId} timezone={timezone} />
      </Suspense>
    </section>
  );
}

function FeeFollowUpsFallback() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

type Notice = { tone: "status" | "alert"; message: string } | null;

function FeeFollowUps({
  enrollmentId,
  timezone,
}: {
  enrollmentId: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const { data: history } = useSuspenseQuery(
    feeDuesQueries.history(enrollmentId),
  );
  const [editing, setEditing] = useState<FeeFollowUpResponse | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const today = todayInZone(timezone);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: feeDuesQueries.key.all }),
      queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
    ]);

  const log = useMutation({
    mutationFn: (input: FeeFollowUpInput) =>
      logFeeFollowUp(enrollmentId, input),
    onSettled: refresh,
  });
  const edit = useMutation({
    mutationFn: ({ id, input }: { id: string; input: FeeFollowUpInput }) =>
      editFeeFollowUp(id, input),
    onSettled: refresh,
  });
  const markDone = useMutation({
    mutationFn: (id: string) => markFeeFollowUpDone(id),
    onSettled: refresh,
  });

  async function submitLog(input: FeeFollowUpInput) {
    setNotice(null);
    try {
      const saved = await log.mutateAsync(input);
      setNotice({
        tone: "status",
        message:
          saved.nextFollowUpOn == null
            ? "Fee Follow-up logged."
            : `Fee Follow-up logged. Next follow-up on ${followUpDateLabel(saved.nextFollowUpOn)}.`,
      });
    } catch (error) {
      if (isFeeFollowUpCode(error, "FEE_FOLLOW_UP_NO_DUES")) {
        // The dues were cleared elsewhere; refresh the remaining dues too.
        await invalidateRegisterQueries(queryClient);
        setNotice({ tone: "alert", message: feeFollowUpErrorMessage(error) });
        return;
      }
      throw error;
    }
  }

  async function submitEdit(id: string, input: FeeFollowUpInput) {
    setNotice(null);
    try {
      await edit.mutateAsync({ id, input });
      setEditing(null);
      setNotice({ tone: "status", message: "Fee Follow-up updated." });
    } catch (error) {
      if (isFeeFollowUpCode(error, "FEE_FOLLOW_UP_CLOSED")) {
        setEditing(null);
        setNotice({ tone: "alert", message: feeFollowUpErrorMessage(error) });
        return;
      }
      throw error;
    }
  }

  function submitMarkDone(followUp: FeeFollowUpResponse) {
    setNotice(null);
    markDone.mutate(followUp.id, {
      onSuccess: () => {
        setNotice({ tone: "status", message: "Fee Follow-up marked done." });
      },
      onError: (error) => {
        setNotice({
          tone: "alert",
          message: isFeeFollowUpCode(error, "FEE_FOLLOW_UP_CLOSED")
            ? "This Fee Follow-up was already closed."
            : feeFollowUpErrorMessage(error),
        });
      },
    });
  }

  return (
    <div className="space-y-5">
      {notice?.tone === "status" ? (
        <p role="status" className="text-sm font-medium">
          {notice.message}
        </p>
      ) : (
        <FormAlert message={notice?.message} />
      )}
      {history.remainingPaise > 0 ? (
        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-medium">Log a follow-up</h3>
          <FeeFollowUpForm
            idPrefix="fee-follow-up"
            today={today}
            submitLabel="Log follow-up"
            onSubmit={submitLog}
          />
        </div>
      ) : (
        <p className="text-muted-foreground rounded-xl border border-dashed p-3 text-sm">
          No dues left. Fee Follow-ups close once the dues are paid.
        </p>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">History</h3>
        <FeeFollowUpHistory
          items={history.items}
          timezone={timezone}
          markingDone={markDone.isPending}
          onEdit={(followUp) => {
            setNotice(null);
            setEditing(followUp);
          }}
          onMarkDone={submitMarkDone}
        />
      </div>
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Fee Follow-up</DialogTitle>
            <DialogDescription>
              Change the channel, note, or next follow-up date. The older values
              aren’t kept.
            </DialogDescription>
          </DialogHeader>
          {editing == null ? null : (
            <FeeFollowUpForm
              key={editing.id}
              idPrefix="edit-fee-follow-up"
              today={today}
              defaultValues={editing}
              submitLabel="Save changes"
              onSubmit={(input) => submitEdit(editing.id, input)}
              onCancel={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
