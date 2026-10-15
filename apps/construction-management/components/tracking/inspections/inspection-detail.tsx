"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  FileImage,
  Pencil,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
import { LocationLabel } from "@/components/locations/location-picker";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { TrackingDocumentFiles } from "@/components/tracking/documents/tracking-document-files";
import { fieldForCode } from "@/lib/server-errors";
import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import {
  drawingAlbumPath,
  inspectionQuery,
  inspectionsPath,
  reinspectionPath,
  snagPath,
  useInspectionCommand,
  type Inspection,
} from "@/src/queries/tracking-inspections";
import { INSPECTION_STATUS_LABELS } from "@/src/tracking/domain/inspection";

import {
  InspectionRejectDialog,
  InspectionStatusBadge,
  inspectionWhen,
  instantText,
} from "./inspection-format";
import { InspectionObservations, InspectionRemarks } from "./inspection-thread";

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

/** Approved / Rejected by whom and when, with the reason; or still pending. */
function DecisionPanel({
  inspection,
  onApprove,
  onReject,
  busy,
}: {
  inspection: Inspection;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const { actions } = inspection;
  if (inspection.status === "pending")
    return (
      <section
        aria-label="Decision"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
      >
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{INSPECTION_STATUS_LABELS.pending}</p>
          <p className="text-muted-foreground text-sm">
            {inspection.inspector?.name == null
              ? "Anyone with Approve or Reject can decide it."
              : `${inspection.inspector.name} inspects; anyone with Approve or Reject can decide it.`}
          </p>
        </div>
        {(actions.approve || actions.reject) && (
          <div className="flex flex-wrap gap-2">
            {actions.reject && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onReject}
              >
                <CircleX aria-hidden="true" />
                Reject
              </Button>
            )}
            {actions.approve && (
              <Button type="button" disabled={busy} onClick={onApprove}>
                <CircleCheck aria-hidden="true" />
                Approve
              </Button>
            )}
          </div>
        )}
      </section>
    );
  const approved = inspection.status === "approved";
  return (
    <section
      aria-label="Decision"
      className={cn(
        "space-y-1 rounded-xl border p-4",
        approved
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
          : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
      )}
    >
      <p className="font-medium">
        {approved ? "Approved" : "Rejected"} by{" "}
        {inspection.decidedBy?.name ?? "a former member"}
        {inspection.decidedAt != null &&
          ` on ${instantText(inspection.decidedAt)}`}
      </p>
      {inspection.rejectionReason != null && (
        <p className="text-sm break-words whitespace-pre-line">
          <span className="font-medium">Reason: </span>
          {inspection.rejectionReason}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        A decided request is final; remarks can still be added.
      </p>
    </section>
  );
}

/** Re-inspection links both ways and the snags raised from a rejection. */
function Links({
  inspection,
  projectId,
}: {
  inspection: Inspection;
  projectId: string;
}) {
  const { reinspectionOf, reinspections, snags } = inspection;
  if (
    reinspectionOf == null &&
    reinspections.length === 0 &&
    snags.length === 0
  )
    return null;
  return (
    <section
      aria-label="Linked records"
      className="space-y-2 rounded-xl border p-4"
    >
      {reinspectionOf != null && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <RotateCcw aria-hidden="true" className="size-4" />
          Re-inspection of{" "}
          <Link
            href={inspectionsPath(projectId, `/${reinspectionOf.id}`)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {reinspectionOf.number}
          </Link>
          <InspectionStatusBadge status={reinspectionOf.status} />
        </p>
      )}
      {reinspections.map((item) => (
        <p key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
          <RotateCcw aria-hidden="true" className="size-4" />
          Inspected again as{" "}
          <Link
            href={inspectionsPath(projectId, `/${item.id}`)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {item.number}
          </Link>
          <InspectionStatusBadge status={item.status} />
        </p>
      ))}
      {snags.map((snag) => (
        <p key={snag.id} className="flex flex-wrap items-center gap-2 text-sm">
          <TriangleAlert aria-hidden="true" className="size-4" />
          Snag raised:{" "}
          <Link
            href={snagPath(projectId, snag.id)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {snag.number}
          </Link>
        </p>
      ))}
    </section>
  );
}

function Drawings({
  inspection,
  projectId,
}: {
  inspection: Inspection;
  projectId: string;
}) {
  return (
    <section aria-labelledby="inspection-drawings" className="space-y-2">
      <h3 id="inspection-drawings" className="text-sm font-semibold">
        Linked drawings
      </h3>
      {inspection.drawings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No drawings linked.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {inspection.drawings.map((drawing) => (
            <li key={drawing.id} className="min-w-0 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <FileImage
                  aria-hidden="true"
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
                <div className="min-w-0">
                  {drawing.albumId == null ? (
                    <p className="truncate text-sm font-medium">
                      {drawing.name ?? "A removed drawing"}
                    </p>
                  ) : (
                    <Link
                      href={drawingAlbumPath(projectId, drawing.albumId)}
                      className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {drawing.name}
                    </Link>
                  )}
                  <p className="text-muted-foreground truncate text-xs">
                    {drawing.albumName ?? "Removed"}
                    {drawing.revision != null &&
                      ` · R${String(drawing.revision)}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One Inspection Request (CM-804): its fields and status, the decision
 * (approved / rejected by whom, when, why), linked drawings that open in
 * Project Drawings, files, observations and remarks, the re-inspection
 * links both ways and any snag raised from it. Approve, Reject (with
 * **Also raise a snag**), Edit and Delete while pending; **Raise
 * re-inspection** once rejected.
 */
export function InspectionDetail({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const router = useRouter();
  const { data: inspection } = useSuspenseQuery(inspectionQuery(id));
  const access = useQuery(trackingAccessQuery(projectId)).data;
  const canUpload =
    access != null &&
    (canInTracking(access, "tracking.inspection_requests", "create") ||
      canInTracking(access, "tracking.inspection_requests", "update"));
  const command = useInspectionCommand();
  const [dialog, setDialog] = useState<"reject" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const listHref = inspectionsPath(projectId);
  const { actions } = inspection;
  const pending = inspection.status === "pending";

  const approve = () => {
    setError(null);
    command.mutate(
      {
        kind: "approve",
        id: inspection.id,
        expectedUpdatedAt: inspection.updatedAt,
      },
      {
        onError: (failure) => {
          setError(fieldForCode(failure, {}).message);
        },
      },
    );
  };

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <SiteRecordHeader
        back={{ label: "Inspection Requests", href: listHref }}
        size="detail"
        title={inspection.number}
        meta={`Inspection on ${inspectionWhen(inspection)}`}
        actions={
          <>
            <InspectionStatusBadge status={inspection.status} />
            {actions.reinspect && (
              <Link
                href={reinspectionPath(projectId, inspection.id)}
                className={buttonVariants({ size: "sm" })}
              >
                <RotateCcw aria-hidden="true" />
                Raise re-inspection
              </Link>
            )}
            {actions.edit && (
              <Link
                href={inspectionsPath(projectId, `/${inspection.id}/edit`)}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {actions.delete && (
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

      <div className="w-full max-w-4xl min-w-0 space-y-6">
        <DecisionPanel
          inspection={inspection}
          busy={command.isPending}
          onApprove={approve}
          onReject={() => {
            setDialog("reject");
          }}
        />
        <Links inspection={inspection} projectId={projectId} />

        <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
          <Fact label="Description of work" className="sm:col-span-3">
            {inspection.workDescription}
          </Fact>
          <Fact label="Inspection">{inspectionWhen(inspection)}</Fact>
          <Fact label="Inspector">
            {inspection.inspector == null
              ? "Not named"
              : (inspection.inspector.name ?? "A former member")}
          </Fact>
          <Fact label="Contractor">{inspection.contractor?.name ?? "—"}</Fact>
          <Fact label="Department">{inspection.department?.name ?? "—"}</Fact>
          <Fact label="Location">
            {inspection.siteLocation == null ? (
              "—"
            ) : (
              <Suspense fallback="…">
                <LocationLabel
                  projectId={projectId}
                  value={inspection.siteLocation}
                />
              </Suspense>
            )}
          </Fact>
          <Fact label="Raised by">
            {inspection.createdBy.name ?? "A former member"} ·{" "}
            {instantText(inspection.createdAt)}
          </Fact>
        </dl>

        <Drawings inspection={inspection} projectId={projectId} />

        <TrackingDocumentFiles
          documentType="inspection"
          documentId={inspection.id}
          heading="Drawings and site photographs"
          canEdit={pending && canUpload}
        />

        <InspectionObservations
          inspectionId={inspection.id}
          canObserve={actions.observe}
          // Whoever may observe may attach files: Update, or the inspector.
          canUpload={actions.observe}
        />

        <InspectionRemarks
          inspectionId={inspection.id}
          canRemark={actions.remark}
        />
      </div>

      <InspectionRejectDialog
        open={dialog === "reject"}
        onOpenChange={(open) => {
          setDialog(open ? "reject" : null);
        }}
        title={`Reject ${inspection.number}?`}
        description="A rejected request is final. You can raise a re-inspection once the work is put right."
        canRaiseSnag={actions.raiseSnag}
        onSubmit={async ({ reason, raiseSnag }) => {
          try {
            await command.mutateAsync({
              kind: "reject",
              id: inspection.id,
              reason,
              raiseSnag,
              expectedUpdatedAt: inspection.updatedAt,
            });
          } catch (failure) {
            throw new Error(fieldForCode(failure, {}).message, {
              cause: failure,
            });
          }
        }}
      />
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {inspection.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The request, its observations and files are removed. Its number is
              not used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={command.isPending || leaving}
              onClick={() => {
                setError(null);
                command.mutate(
                  {
                    kind: "delete",
                    id: inspection.id,
                    expectedUpdatedAt: inspection.updatedAt,
                  },
                  {
                    onSuccess: () => {
                      setLeaving(true);
                      router.push(listHref);
                    },
                    onError: (failure) => {
                      setDialog(null);
                      setError(fieldForCode(failure, {}).message);
                    },
                  },
                );
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
