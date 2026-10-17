"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate, localToday } from "@/components/payments/payment-format";
import { SalesDocumentFiles } from "@/components/sales/documents/sales-document-files";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { formatDateTime } from "@/components/tracking/issues/issue-parts";
import { QueryHttpError } from "@/src/queries/http";
import { canInSales, salesAccessQuery } from "@/src/queries/sales-access";
import { bookingsPath } from "@/src/queries/sales-bookings";
import {
  inquiriesPath,
  inquiryQuery,
  useDeleteInquiry,
} from "@/src/queries/sales-inquiries";

import {
  formatMobile,
  interestedIn,
  InquiryStatusBadge,
  InterestChip,
  NextFollowUp,
} from "./inquiry-parts";
import { InquiryActivity } from "./inquiry-activity";
import { InquiryCloseDialog } from "./inquiry-close-dialog";
import { InquiryReopenDialog } from "./inquiry-reopen-dialog";
import { InquiryTasksPanel } from "./inquiry-tasks-panel";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

function message(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

/**
 * One inquiry (CM-1003, CM-1004): its contact and interest, stage and
 * people, the next follow-up, its Visiting Card and photos (never in the
 * Gallery), the follow-ups merged with its history, and its Inquiry
 * Tasks. Edit and Delete by the viewer's flags.
 */
export function InquiryDetail({
  projectId,
  id,
  today = localToday(),
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const router = useRouter();
  const { data: inquiry } = useSuspenseQuery(inquiryQuery(id));
  const { data: access } = useSuspenseQuery(salesAccessQuery(projectId));
  const canAttach =
    canInSales(access, "sales.inquiries", "create") ||
    canInSales(access, "sales.inquiries", "update");
  const remove = useDeleteInquiry(inquiry.id);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<"close" | "reopen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listHref = inquiriesPath(projectId);
  const person = (value: { name: string | null } | null) =>
    value == null ? "—" : (value.name ?? "A former member");
  const wanted = interestedIn(inquiry);

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <SiteRecordHeader
        back={{ label: "Inquiries", href: listHref }}
        size="detail"
        title={inquiry.name}
        meta={`Inquiry of ${formatDate(inquiry.inquiryDate)}${inquiry.funnelStage == null ? "" : ` · ${inquiry.funnelStage.name}`}`}
        actions={
          <>
            <InquiryStatusBadge status={inquiry.status} />
            {inquiry.interestType != null && (
              <InterestChip interest={inquiry.interestType} />
            )}
            {(inquiry.actions.close || inquiry.actions.convert) && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDialog("close");
                }}
              >
                <CircleCheck aria-hidden="true" />
                Close
              </Button>
            )}
            {inquiry.actions.reopen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("reopen");
                }}
              >
                <RotateCcw aria-hidden="true" />
                Reopen
              </Button>
            )}
            {inquiry.actions.edit && (
              <Link
                href={`${inquiriesPath(projectId, inquiry.id)}/edit`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {inquiry.actions.delete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  setDeleting(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <FormAlert message={error ?? undefined} />

      <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <dl className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-3">
            {inquiry.status === "converted" && (
              <Fact label="Converted to" className="sm:col-span-3">
                {inquiry.convertedUnit?.name ?? "A removed unit"}
                {inquiry.convertedBookingId != null && (
                  <>
                    {" · "}
                    <Link
                      href={bookingsPath(projectId, inquiry.convertedBookingId)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      Open the booking
                    </Link>
                  </>
                )}
              </Fact>
            )}
            {inquiry.status === "lost" && (
              <Fact label="Lost Reason" className="sm:col-span-3">
                {inquiry.lostReason?.name ?? "—"}
                {inquiry.lostRemarks == null ? "" : ` · ${inquiry.lostRemarks}`}
              </Fact>
            )}
            <Fact label="Mobile">
              {inquiry.mobile == null ? (
                "—"
              ) : (
                <a
                  href={`tel:${inquiry.mobile}`}
                  className="underline-offset-4 hover:underline"
                >
                  {formatMobile(inquiry.mobile)}
                </a>
              )}
            </Fact>
            <Fact label="Email">{inquiry.email ?? "—"}</Fact>
            <Fact label="Occupation">{inquiry.occupation ?? "—"}</Fact>
            <Fact label="Interested In">{wanted ?? "—"}</Fact>
            <Fact label="Lead Source">{inquiry.leadSource?.name ?? "—"}</Fact>
            <Fact label="Next follow-up">
              <NextFollowUp
                next={inquiry.nextFollowUp}
                due={inquiry.due}
                today={today}
              />
            </Fact>
            <Fact label="Assignee">{person(inquiry.assignee)}</Fact>
            <Fact label="Lead Owner">{person(inquiry.leadOwner)}</Fact>
            <Fact label="Created By">
              {person(inquiry.createdBy)} · {formatDateTime(inquiry.createdAt)}
            </Fact>
            {inquiry.address != null && (
              <Fact label="Address" className="sm:col-span-3">
                {inquiry.address}
              </Fact>
            )}
            {inquiry.remarks != null && (
              <Fact label="Remarks" className="sm:col-span-3">
                {inquiry.remarks}
              </Fact>
            )}
          </dl>

          <SalesDocumentFiles
            documentType="inquiry"
            documentId={inquiry.id}
            roles={[
              { role: "visiting_card", label: "Visiting Card" },
              { role: "photo", label: "Photos" },
            ]}
            canEdit={canAttach}
            heading="Visiting Card and photos"
          />

          <InquiryActivity projectId={projectId} inquiry={inquiry} />
        </div>
        <InquiryTasksPanel
          projectId={projectId}
          inquiry={inquiry}
          today={today}
        />
      </div>

      {(inquiry.actions.close || inquiry.actions.convert) && (
        <Suspense fallback={null}>
          <InquiryCloseDialog
            projectId={projectId}
            inquiry={inquiry}
            open={dialog === "close"}
            onOpenChange={(open) => {
              setDialog(open ? "close" : null);
            }}
            today={today}
          />
        </Suspense>
      )}
      {inquiry.actions.reopen && (
        <InquiryReopenDialog
          projectId={projectId}
          inquiry={inquiry}
          open={dialog === "reopen"}
          onOpenChange={(open) => {
            setDialog(open ? "reopen" : null);
          }}
        />
      )}
      <AlertDialog
        open={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {inquiry.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The inquiry leaves the list, the reports and the dashboard, with
              its follow-ups and tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(inquiry.updatedAt, {
                  onSuccess: () => {
                    router.push(listHref);
                  },
                  onError: (caught) => {
                    setDeleting(false);
                    setError(message(caught));
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
