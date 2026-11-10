import { Badge } from "@repo/ui/components/badge";

import {
  ENQUIRY_STAGE_LABELS,
  type EnquiryStage,
} from "@/src/queries/enquiries";

const STAGE_TONES: Record<EnquiryStage, string> = {
  new: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  follow_up:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  demo_scheduled:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200",
  demo_attended:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200",
  joined:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  not_interested:
    "border-border bg-muted text-muted-foreground dark:bg-muted/60",
};

export function EnquiryStageBadge({
  stage,
  followUpDue = false,
  className,
}: {
  stage: EnquiryStage;
  /** A follow-up stage reads "Follow-up due" only once its date has come. */
  followUpDue?: boolean;
  className?: string;
}) {
  const label =
    stage === "follow_up" && !followUpDue
      ? "Follow-up"
      : ENQUIRY_STAGE_LABELS[stage];
  return (
    <Badge
      variant="outline"
      className={`${STAGE_TONES[stage]} ${className ?? ""}`}
    >
      {label}
    </Badge>
  );
}
