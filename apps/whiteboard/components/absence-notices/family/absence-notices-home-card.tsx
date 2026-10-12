"use client";

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
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import type { FamilyHomeRole } from "@/components/home/family-home";
import {
  absenceNoticeQueries,
  withdrawAbsenceNotice,
  type FamilyAbsenceNoticeView,
  type FamilyAbsenceNoticesView,
} from "@/src/queries/absence-notices";
import { ABSENCE_REASON_LABELS } from "@/src/training-institute/domain/absence-notice";

import {
  classCount,
  givenByLabel,
  noticeClassWhen,
  standingLabel,
} from "./absence-notice-format";
import { GiveAbsenceNoticeDialog } from "./give-absence-notice-dialog";

export type { FamilyAbsenceNoticesView };

export const NO_ABSENCE_NOTICES: FamilyAbsenceNoticesView = { students: [] };

type Message = { tone: "status" | "alert"; text: string } | null;

/**
 * One Student's upcoming Absence Notices on Student or Parent Home, with
 * Withdraw and Give absence notice (ADR-0041).
 */
export function AbsenceNoticesHomeCard({
  student,
  notices,
  role,
  now,
}: {
  student: { id: string; name: string };
  /** Every linked Student's notices; this card shows `student`'s. */
  notices: FamilyAbsenceNoticesView;
  role: FamilyHomeRole;
  now: Date;
}) {
  const queryClient = useQueryClient();
  const [giving, setGiving] = useState(false);
  const [withdrawing, setWithdrawing] =
    useState<FamilyAbsenceNoticeView | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const withdraw = useMutation({
    mutationFn: withdrawAbsenceNotice,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: absenceNoticeQueries.key.all }),
  });

  const items =
    notices.students.find((candidate) => candidate.id === student.id)
      ?.notices ?? [];
  const listId = `absence-notices-${student.id}`;

  function confirmWithdraw(notice: FamilyAbsenceNoticeView) {
    setWithdrawing(null);
    setMessage(null);
    withdraw.mutate(notice.id, {
      onSuccess: () => {
        setMessage({ tone: "status", text: "Absence notice withdrawn." });
      },
      onError: (error) => {
        setMessage({
          tone: "alert",
          text:
            error.message === ""
              ? "Couldn’t withdraw the absence notice. Please try again."
              : error.message,
        });
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle id={listId}>Absence Notices</CardTitle>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setMessage(null);
              setGiving(true);
            }}
          >
            Give absence notice
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {message?.tone === "status" ? (
          <p role="status" className="font-medium">
            {message.text}
          </p>
        ) : (
          <FormAlert message={message?.text} />
        )}
        {items.length === 0 ? (
          <p className="text-muted-foreground">
            {role === "parent"
              ? `No absence notices. Tell the Teacher ahead if ${student.name} will miss a Class.`
              : "No absence notices. Tell the Teacher ahead if you’ll miss a Class."}
          </p>
        ) : (
          <ul aria-labelledby={listId} className="divide-y">
            {items.map((notice) => (
              <NoticeRow
                key={notice.id}
                notice={notice}
                role={role}
                now={now}
                busy={withdraw.isPending && withdraw.variables === notice.id}
                onWithdraw={() => {
                  setWithdrawing(notice);
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <GiveAbsenceNoticeDialog
        open={giving}
        onOpenChange={setGiving}
        student={student}
        role={role}
        now={now}
        onGiven={(count) => {
          setMessage({
            tone: "status",
            text: `Absence notice sent to the Teacher for ${classCount(count)}.`,
          });
        }}
      />

      <AlertDialog
        open={withdrawing != null}
        onOpenChange={(open) => {
          if (!open) setWithdrawing(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this absence notice?</AlertDialogTitle>
            <AlertDialogDescription>
              {withdrawing == null
                ? null
                : `${withdrawing.class.courseName} · ${withdrawing.class.batchName}, ${noticeClassWhen(withdrawing.class, now)}. `}
              {withdrawing?.standing === "applies"
                ? "The Teacher is notified that it’s withdrawn."
                : "It no longer applies, so nobody is notified."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (withdrawing != null) confirmWithdraw(withdrawing);
              }}
            >
              Withdraw
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function NoticeRow({
  notice,
  role,
  now,
  busy,
  onWithdraw,
}: {
  notice: FamilyAbsenceNoticeView;
  role: FamilyHomeRole;
  now: Date;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const when = noticeClassWhen(notice.class, now);
  const standing = standingLabel(notice);
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <p className="font-medium tabular-nums">
          {when}
          {notice.class.rescheduled && " · Rescheduled"}
        </p>
        <p className="text-muted-foreground text-xs">
          {notice.class.courseName} · {notice.class.batchName}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {ABSENCE_REASON_LABELS[notice.reason]}
          </Badge>
          {standing != null && (
            <Badge variant="outline">No longer needed</Badge>
          )}
        </div>
        {standing != null && <p className="text-xs">{standing}</p>}
        {notice.note != null && (
          <p className="break-words whitespace-pre-line">{notice.note}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {givenByLabel(notice.givenBy, role)}
        </p>
      </div>
      {notice.canWithdraw && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={busy}
          aria-label={`Withdraw notice for ${notice.class.courseName}, ${when}`}
          onClick={onWithdraw}
        >
          {busy ? "Withdrawing…" : "Withdraw"}
        </Button>
      )}
    </li>
  );
}
