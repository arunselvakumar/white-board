import {
  Ellipsis,
  MessageSquareText,
  Phone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";

import {
  FEE_FOLLOW_UP_CHANNEL_LABELS,
  FEE_FOLLOW_UP_CLOSE_REASON_LABELS,
  type FeeFollowUpChannel,
  type FeeFollowUpResponse,
} from "@/src/queries/fee-dues";

import { followUpDateLabel, loggedAtLabel } from "./fee-follow-up-format";

const CHANNEL_ICONS: Record<FeeFollowUpChannel, LucideIcon> = {
  phone: Phone,
  whatsapp_sms: MessageSquareText,
  in_person: UserRound,
  other: Ellipsis,
};

/** Same tones as the Enquiry "Follow-up" and closed stage badges. */
const OPEN_TONE =
  "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
const CLOSED_TONE =
  "border-border bg-muted text-muted-foreground dark:bg-muted/60";

export function FeeFollowUpHistory({
  items,
  timezone,
  markingDone,
  onEdit,
  onMarkDone,
}: {
  /** Newest first. */
  items: FeeFollowUpResponse[];
  timezone: string;
  markingDone: boolean;
  onEdit: (followUp: FeeFollowUpResponse) => void;
  onMarkDone: (followUp: FeeFollowUpResponse) => void;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No follow-ups yet.</p>;
  }
  return (
    <ol className="relative space-y-5" aria-label="Fee Follow-up history">
      {items.map((followUp, index) => {
        const Icon = CHANNEL_ICONS[followUp.channel];
        const channel = FEE_FOLLOW_UP_CHANNEL_LABELS[followUp.channel];
        return (
          <li key={followUp.id} className="relative flex gap-3">
            {index < items.length - 1 ? (
              <span
                aria-hidden="true"
                className="bg-border absolute top-8 bottom-[-1.25rem] left-4 w-px"
              />
            ) : null}
            <span className="bg-muted text-muted-foreground relative flex size-8 shrink-0 items-center justify-center rounded-full">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-medium">{channel}</p>
                {followUp.open ? (
                  <Badge variant="outline" className={OPEN_TONE}>
                    Open
                  </Badge>
                ) : (
                  <Badge variant="outline" className={CLOSED_TONE}>
                    {followUp.closeReason == null
                      ? "Closed"
                      : FEE_FOLLOW_UP_CLOSE_REASON_LABELS[followUp.closeReason]}
                  </Badge>
                )}
              </div>
              {followUp.note == null ? null : (
                <p className="text-sm break-words whitespace-pre-line">
                  {followUp.note}
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                {followUp.nextFollowUpOn == null
                  ? "No next follow-up date"
                  : `Next follow-up: ${followUpDateLabel(followUp.nextFollowUpOn)}`}
              </p>
              <p className="text-muted-foreground text-xs">
                <time dateTime={followUp.loggedAt}>
                  {loggedAtLabel(followUp.loggedAt, timezone)}
                </time>
                {` · Logged by ${followUp.loggedBy.name}`}
                {followUp.editedBy == null
                  ? null
                  : ` · Edited by ${followUp.editedBy.name}`}
              </p>
              {followUp.open ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onEdit(followUp);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={markingDone}
                    onClick={() => {
                      onMarkDone(followUp);
                    }}
                  >
                    {markingDone ? "Marking done…" : "Mark done"}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
