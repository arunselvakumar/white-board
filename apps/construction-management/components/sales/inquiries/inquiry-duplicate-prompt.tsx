"use client";

import Link from "next/link";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";

import {
  inquiriesPath,
  type InquiryDuplicateMatch,
} from "@/src/queries/sales-inquiries";

import { InquiryStatusBadge } from "./inquiry-parts";

/**
 * The duplicate-lead prompt (CM-0022 §3): another live inquiry of the
 * Project has the same mobile or email. It lists them (one the viewer
 * may not see is named as such) and offers **Save anyway**, which resends
 * the save with `allowDuplicate`.
 */
export function InquiryDuplicatePrompt({
  projectId,
  matches,
  pending,
  onSaveAnyway,
  onClose,
}: {
  projectId: string;
  /** Null keeps the prompt closed. */
  matches: readonly InquiryDuplicateMatch[] | null;
  pending: boolean;
  onSaveAnyway: () => void;
  onClose: () => void;
}) {
  const shown = matches ?? [];
  return (
    <AlertDialog
      open={matches != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Possible duplicate</AlertDialogTitle>
          <AlertDialogDescription>
            {shown.length === 1
              ? "Another inquiry of this Project has the same mobile or email."
              : `${String(shown.length)} inquiries of this Project have the same mobile or email.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul aria-label="Matching inquiries" className="space-y-2">
          {shown.map((match) => (
            <li
              key={match.id}
              className="bg-card flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              {match.name == null ? (
                <span className="text-muted-foreground text-sm">
                  An inquiry you cannot see
                </span>
              ) : (
                <Link
                  href={inquiriesPath(projectId, match.id)}
                  target="_blank"
                  className="min-w-0 truncate text-sm font-medium hover:underline"
                >
                  {match.name}
                </Link>
              )}
              <InquiryStatusBadge status={match.status} />
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <Button type="button" disabled={pending} onClick={onSaveAnyway}>
            Save anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
