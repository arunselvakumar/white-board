"use client";

import { CheckCircle2, Pencil, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { companyPath } from "@/src/queries/marketing-companies";
import type { FollowUp } from "@/src/queries/marketing-follow-ups";
import { visitPath } from "@/src/queries/marketing-visits";

import {
  CancelFollowUpDialog,
  DoneFollowUpDialog,
} from "./follow-up-close-dialogs";
import { FollowUpDialog } from "./follow-up-dialog";
import {
  dayWords,
  FollowUpStatusBadge,
  FollowUpTypeBadge,
} from "./follow-up-parts";

export type FollowUpAction = "done" | "edit" | "cancel";

/** Opens one of a Follow-up's dialogs; `today` is its list's (Company's) today. */
export type OnFollowUpAction = (
  action: FollowUpAction,
  followUp: FollowUp,
  today: string,
) => void;

type Open = {
  action: FollowUpAction;
  followUp: FollowUp;
  today: string;
} | null;

/**
 * The Done, Edit and Cancel dialogs for one list, kept above the rows so
 * a dialog stays open while the list it came from refreshes (Done moves
 * a row away, then offers Log the visit).
 */
export function useFollowUpActions({ canLogVisit }: { canLogVisit: boolean }) {
  const [open, setOpen] = useState<Open>(null);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  const dialogs =
    open == null ? null : open.action === "done" ? (
      <DoneFollowUpDialog
        followUp={open.followUp}
        today={open.today}
        canLogVisit={canLogVisit}
        open
        onOpenChange={close}
      />
    ) : open.action === "edit" ? (
      <FollowUpDialog followUp={open.followUp} open onOpenChange={close} />
    ) : (
      <CancelFollowUpDialog
        followUp={open.followUp}
        open
        onOpenChange={close}
      />
    );
  return {
    onAction: ((action, followUp, today) => {
      setOpen({ action, followUp, today });
    }) satisfies OnFollowUpAction,
    dialogs,
  };
}

function CompanyName({ followUp }: { followUp: FollowUp }) {
  const { prospectCompany: company } = followUp;
  return company.canOpen ? (
    <Link
      href={companyPath(company.id)}
      className="min-w-0 font-medium break-words hover:underline"
    >
      {company.name}
    </Link>
  ) : (
    <span className="min-w-0 font-medium break-words">{company.name}</span>
  );
}

/**
 * Follow-ups as cards: type, company, due date, owner, note, the Visit it
 * came from, what came of it once Done, and Done, Edit and Cancel as its
 * `actions` allow.
 */
export function FollowUpItems({
  items,
  today,
  label,
  onAction,
  showStatus = false,
  showCompany = true,
  showVisit = true,
}: {
  items: readonly FollowUp[];
  /** The list's (Company's) today, for the Done dialog. */
  today: string;
  /** The list's accessible name. */
  label: string;
  onAction: OnFollowUpAction;
  /** Its status (or due) as a badge, for lists that mix them. */
  showStatus?: boolean;
  showCompany?: boolean;
  showVisit?: boolean;
}) {
  return (
    <ul aria-label={label} className="min-w-0 space-y-2">
      {items.map((followUp) => {
        const overdue = followUp.due === "overdue";
        const { actions, visit } = followUp;
        return (
          <li
            key={followUp.id}
            className={cn(
              "bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between",
              overdue && "border-red-300 dark:border-red-800",
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <FollowUpTypeBadge type={followUp.type} />
                {showCompany && <CompanyName followUp={followUp} />}
                {showStatus && (
                  <FollowUpStatusBadge
                    status={followUp.status}
                    due={followUp.due}
                  />
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                <span
                  className={cn(
                    overdue && "font-medium text-red-700 dark:text-red-300",
                  )}
                >
                  {`Due ${dayWords(followUp.dueDate)}`}
                </span>
                {` · ${followUp.owner.name}`}
                {showVisit && visit != null && (
                  <>
                    {" · from "}
                    {visit.canOpen ? (
                      <Link
                        href={visitPath(visit.id)}
                        className="text-foreground whitespace-nowrap underline-offset-4 hover:underline"
                      >
                        {visit.number}
                      </Link>
                    ) : (
                      <span className="whitespace-nowrap">{visit.number}</span>
                    )}
                  </>
                )}
              </p>
              {followUp.note != null && (
                <p className="text-sm break-words whitespace-pre-line">
                  {followUp.note}
                </p>
              )}
              {followUp.status === "done" && (
                <p className="text-sm break-words whitespace-pre-line">
                  <span className="font-medium">
                    {`Done${followUp.doneOn == null ? "" : ` ${dayWords(followUp.doneOn)}`}`}
                  </span>
                  {followUp.resultNote == null
                    ? ""
                    : `: ${followUp.resultNote}`}
                </p>
              )}
            </div>
            {followUp.status === "open" &&
              (actions.canClose || actions.canUpdate) && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {actions.canClose && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onAction("done", followUp, today);
                      }}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      Done
                    </Button>
                  )}
                  {actions.canUpdate && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAction("edit", followUp, today);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                  )}
                  {actions.canClose && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAction("cancel", followUp, today);
                      }}
                    >
                      <XCircle aria-hidden="true" />
                      Cancel
                    </Button>
                  )}
                </div>
              )}
          </li>
        );
      })}
    </ul>
  );
}
