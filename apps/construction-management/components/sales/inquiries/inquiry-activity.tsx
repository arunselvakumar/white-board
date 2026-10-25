"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate } from "@/components/payments/payment-format";
import { formatDateTime } from "@/components/tracking/issues/issue-parts";
import { QueryHttpError } from "@/src/queries/http";
import { bookingsPath } from "@/src/queries/sales-bookings";
import {
  inquiryActivityQuery,
  useDeleteFollowUp,
  type FollowUp,
  type InquiryDetail,
} from "@/src/queries/sales-inquiries";
import {
  FOLLOW_UP_ACTIVITY_LABELS,
  type FollowUpActivity,
} from "@/src/sales/domain/sales-terms";

import { InquiryFollowUpDialog } from "./inquiry-follow-up-dialog";
import { inquiryHistoryLine } from "./inquiry-parts";
import { TimelineSkeleton } from "./inquiries-skeletons";

const ACTIVITY_ICONS: Record<FollowUpActivity, LucideIcon> = {
  call: Phone,
  site_visit: MapPin,
  meeting: MessagesSquare,
  whatsapp: MessageCircle,
  email: Mail,
  other: StickyNote,
};

function when(value: { date: string; time: string | null }): string {
  return value.time == null
    ? formatDate(value.date)
    : `${formatDate(value.date)}, ${value.time}`;
}

function FollowUpEntry({
  inquiryId,
  followUp,
}: {
  inquiryId: string;
  followUp: FollowUp;
}) {
  const remove = useDeleteFollowUp(inquiryId);
  const [error, setError] = useState<string | undefined>();
  const Icon = ACTIVITY_ICONS[followUp.activity];
  return (
    <li className="min-w-0 space-y-1.5 rounded-lg border p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon aria-hidden="true" className="text-muted-foreground size-4" />
          {FOLLOW_UP_ACTIVITY_LABELS[followUp.activity]}
          <span className="text-muted-foreground text-xs font-normal">
            {when(followUp.doneOn)}
          </span>
        </p>
        {followUp.canDelete && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            aria-label={`Remove the ${FOLLOW_UP_ACTIVITY_LABELS[followUp.activity].toLowerCase()} of ${when(followUp.doneOn)}`}
            disabled={remove.isPending}
            onClick={() => {
              setError(undefined);
              remove.mutate(followUp.id, {
                onError: (caught) => {
                  setError(
                    caught instanceof QueryHttpError
                      ? caught.message
                      : "Something went wrong. Please try again.",
                  );
                },
              });
            }}
          >
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>
      {followUp.remarks != null && (
        <p className="text-sm break-words whitespace-pre-line">
          {followUp.remarks}
        </p>
      )}
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {followUp.toStage != null && (
          <span>
            {`Moved from ${followUp.fromStage?.name ?? "a deleted stage"} to ${followUp.toStage.name ?? "a deleted stage"}`}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarClock aria-hidden="true" className="size-3" />
          {followUp.nextFollowUp == null
            ? "No next follow-up"
            : `Next ${when(followUp.nextFollowUp)}`}
        </span>
        <span>{followUp.by.name ?? "A former member"}</span>
      </div>
      <FormAlert message={error} />
    </li>
  );
}

function Timeline({
  projectId,
  inquiry,
}: {
  projectId: string;
  inquiry: InquiryDetail;
}) {
  const { data } = useSuspenseQuery(inquiryActivityQuery(inquiry.id));
  if (data.items.length === 0)
    return <p className="text-muted-foreground text-sm">Nothing yet.</p>;
  return (
    <ol aria-label="Follow-ups and history" className="space-y-2">
      {data.items.map((item) =>
        item.kind === "follow_up" ? (
          <FollowUpEntry
            key={item.followUp.id}
            inquiryId={inquiry.id}
            followUp={item.followUp}
          />
        ) : (
          <li key={item.event.id} className="border-l-2 py-1 pl-3 text-sm">
            <p className="break-words">{inquiryHistoryLine(item.event)}</p>
            {item.event.type === "converted" &&
            typeof item.event.details?.["bookingId"] === "string" ? (
              <Link
                href={bookingsPath(projectId, item.event.details["bookingId"])}
                className="text-xs font-medium underline-offset-4 hover:underline"
              >
                Open the booking
              </Link>
            ) : null}
            {item.event.type === "lost" &&
            typeof item.event.details?.["remarks"] === "string" ? (
              <p className="text-muted-foreground text-xs break-words">
                {item.event.details["remarks"]}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {item.event.by.name ?? "A former member"} ·{" "}
              {formatDateTime(item.event.at)}
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

/**
 * An inquiry's follow-ups merged with its history, newest first (CM-1004):
 * calls, visits and messages with their remarks, stage moves and next
 * follow-up; and who assigned, changed the Lead Owner or moved the stage.
 * **Add follow-up** while it is Open (Inquiry Update); an Inquiry Delete
 * holder removes one entered by mistake.
 */
export function InquiryActivity({
  projectId,
  inquiry,
  now,
}: {
  projectId: string;
  inquiry: InquiryDetail;
  now?: Date;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="inquiry-activity" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="inquiry-activity" className="text-sm font-semibold">
          Follow-ups and history
        </h3>
        {inquiry.actions.followUp && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add follow-up
          </Button>
        )}
      </div>
      <Suspense fallback={<TimelineSkeleton />}>
        <Timeline projectId={projectId} inquiry={inquiry} />
      </Suspense>
      {inquiry.actions.followUp && (
        <Suspense fallback={null}>
          <InquiryFollowUpDialog
            projectId={projectId}
            inquiry={inquiry}
            open={adding}
            onOpenChange={setAdding}
            {...(now == null ? {} : { now })}
          />
        </Suspense>
      )}
    </section>
  );
}
