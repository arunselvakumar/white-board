"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, Pencil, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/utils";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LocationLabel } from "@/components/locations/location-picker";
import { SiteWorkDocumentActivity } from "@/components/site-work/documents/site-work-document-activity";
import {
  formatDate,
  localToday,
} from "@/components/procurement/inventory/inventory-format";
import { HINDRANCE_CAUSE_LABELS } from "@/src/site-work/domain/hindrance";
import { QueryHttpError } from "@/src/queries/http";
import {
  hindranceQuery,
  hindrancesPath,
  useCloseHindrance,
  useDeleteHindrance,
  type Hindrance,
} from "@/src/queries/hindrances";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";

import {
  hindrancePeriod,
  HindranceStatusBadge,
  lostSummary,
  partyLabel,
} from "./hindrance-parts";

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

const HOURS = /^\d{1,6}(\.\d{1,2})?$/;

function message(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

/** **Close**: the end date and the hours lost. */
function CloseDialog({
  hindrance,
  open,
  onClose,
}: {
  hindrance: Hindrance;
  open: boolean;
  onClose: () => void;
}) {
  const close = useCloseHindrance(hindrance.id);
  const today = localToday();
  const [endDate, setEndDate] = useState(today);
  const [hours, setHours] = useState(hindrance.hoursLost ?? "");
  const [errors, setErrors] = useState<{
    endDate?: string;
    hoursLost?: string;
    form?: string;
  }>({});
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close {hindrance.number}</DialogTitle>
          <DialogDescription>
            Record the day work could go on again. Days lost count from the
            start date to this date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="close-end-date">End date</Label>
            <Input
              id="close-end-date"
              type="date"
              min={hindrance.startDate}
              max={today}
              value={endDate}
              aria-invalid={errors.endDate != null}
              onChange={(event) => {
                setEndDate(event.target.value);
              }}
            />
            <FieldError message={errors.endDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="close-hours">Hours lost</Label>
            <Input
              id="close-hours"
              inputMode="decimal"
              autoComplete="off"
              value={hours}
              aria-invalid={errors.hoursLost != null}
              onChange={(event) => {
                setHours(event.target.value);
              }}
            />
            <FieldError message={errors.hoursLost} />
          </div>
          <FormAlert message={errors.form} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={close.isPending}
            onClick={() => {
              const trimmed = hours.trim();
              if (endDate === "") {
                setErrors({ endDate: "Choose the date it ended." });
                return;
              }
              if (endDate < hindrance.startDate) {
                setErrors({
                  endDate: "The end date cannot be before the start date.",
                });
                return;
              }
              if (trimmed !== "" && !HOURS.test(trimmed)) {
                setErrors({
                  hoursLost: "Enter hours, with at most 2 decimals.",
                });
                return;
              }
              setErrors({});
              close.mutate(
                {
                  endDate,
                  hoursLost: trimmed === "" ? null : trimmed,
                  expectedUpdatedAt: hindrance.updatedAt,
                },
                {
                  onSuccess: onClose,
                  onError: (caught) => {
                    setErrors({ form: message(caught) });
                  },
                },
              );
            }}
          >
            Close hindrance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignOff({ hindrance }: { hindrance: Hindrance }) {
  const signOff = hindrance.signOff;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Joint sign-off</h3>
      {signOff == null ? (
        <p className="text-muted-foreground text-sm">
          Not signed off yet.
          {hindrance.actions.edit && " Edit the hindrance to record it."}
        </p>
      ) : (
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <Fact label="For the Company">
            {signOff.teamMember == null
              ? "—"
              : (signOff.teamMember.name ?? "A former member")}
          </Fact>
          <Fact label="Other party">
            {signOff.partyName}
            {signOff.partyRole != null && `, ${signOff.partyRole}`}
          </Fact>
          <Fact label="Signed on">{formatDate(signOff.signedOn)}</Fact>
        </dl>
      )}
    </div>
  );
}

/**
 * One hindrance (CM-607): its period and time lost, cause, activity,
 * location, responsible party, description and joint sign-off, with
 * **Close**, Edit and Delete for members who may.
 */
export function HindranceDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: hindrance } = useSuspenseQuery(hindranceQuery(id));
  const { data: access } = useSuspenseQuery(siteWorkAccessQuery(projectId));
  const canAttach =
    canInSiteWork(access, "site_work.hindrances", "create") ||
    canInSiteWork(access, "site_work.hindrances", "update");
  const remove = useDeleteHindrance(hindrance.id);
  const [dialog, setDialog] = useState<"close" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listHref = hindrancesPath(projectId);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <SiteRecordHeader
        back={{ label: "Hindrances", href: listHref }}
        size="detail"
        title={hindrance.number}
        meta={`${HINDRANCE_CAUSE_LABELS[hindrance.cause]} · ${hindrancePeriod(hindrance)}`}
        actions={
          <>
            <HindranceStatusBadge status={hindrance.status} />
            {hindrance.actions.close && (
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
            {hindrance.actions.edit && (
              <Link
                href={`${hindrancesPath(projectId, hindrance.id)}/edit`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {hindrance.actions.delete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  setDialog("delete");
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

      <div className="w-full max-w-4xl space-y-6">
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <Fact label="Affected activity" className="sm:col-span-2">
            {hindrance.affectedActivity}
          </Fact>
          <Fact label="Time lost">{lostSummary(hindrance)}</Fact>
          <Fact label="Start date">{formatDate(hindrance.startDate)}</Fact>
          <Fact label="End date">
            {hindrance.endDate == null
              ? "Continuing"
              : formatDate(hindrance.endDate)}
          </Fact>
          <Fact label="Responsible party">{partyLabel(hindrance)}</Fact>
          <Fact label="Location">
            {hindrance.siteLocation == null ? (
              "—"
            ) : (
              <Suspense fallback="…">
                <LocationLabel
                  projectId={projectId}
                  value={hindrance.siteLocation}
                />
              </Suspense>
            )}
          </Fact>
          {hindrance.equipmentUsageSheet != null && (
            <Fact label="Equipment Usage sheet">
              {hindrance.equipmentUsageSheet.number} ·{" "}
              {formatDate(hindrance.equipmentUsageSheet.sheetDate)}
            </Fact>
          )}
          <Fact label="Recorded by">
            {hindrance.createdBy.name ?? "A former member"}
          </Fact>
          {hindrance.description != null && (
            <Fact label="Description" className="sm:col-span-3">
              {hindrance.description}
            </Fact>
          )}
        </dl>

        <SignOff hindrance={hindrance} />

        <SiteWorkDocumentActivity
          documentType="hindrance"
          documentId={hindrance.id}
          canEdit={canAttach}
        />
      </div>

      {hindrance.actions.close && dialog === "close" && (
        <CloseDialog
          hindrance={hindrance}
          open
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {hindrance.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the register and the Daily Progress Reports made from
              now on. The number is not used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(hindrance.updatedAt, {
                  onSuccess: () => {
                    router.push(listHref);
                  },
                  onError: (caught) => {
                    setDialog(null);
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
