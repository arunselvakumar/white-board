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

import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import { bookingsPath } from "@/src/queries/sales-bookings";
import {
  useReopenInquiry,
  type InquiryDetail,
} from "@/src/queries/sales-inquiries";

/**
 * **Reopen** a Converted or Lost inquiry (CM-1007): it goes back to Open
 * at the stage it had. A Converted one reopens only once its booking is
 * cancelled or deleted; the refusal links the booking.
 */
export function InquiryReopenDialog({
  projectId,
  inquiry,
  open,
  onOpenChange,
}: {
  projectId: string;
  inquiry: InquiryDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reopen = useReopenInquiry(inquiry.id);
  const failure = reopen.error;
  const blocked =
    failure instanceof QueryHttpError &&
    failure.code === "INQUIRY_BOOKING_ACTIVE";
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reopen.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{`Reopen ${inquiry.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {inquiry.status === "converted"
              ? "It goes back to Open. Its booking must be cancelled or deleted first; reopening does not free the unit."
              : `It goes back to Open${inquiry.funnelStage?.name == null ? "" : ` at ${inquiry.funnelStage.name}`}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure != null ? (
          <FormAlert
            message={
              failure instanceof QueryHttpError
                ? failure.message
                : "Something went wrong. Please try again."
            }
          />
        ) : null}
        {blocked && inquiry.convertedBookingId != null ? (
          <Link
            href={bookingsPath(projectId, inquiry.convertedBookingId)}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Open the booking
          </Link>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep closed</AlertDialogCancel>
          <Button
            type="button"
            disabled={reopen.isPending}
            onClick={() => {
              reopen.mutate(inquiry.updatedAt, {
                onSuccess: () => {
                  reopen.reset();
                  onOpenChange(false);
                },
              });
            }}
          >
            Reopen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
