"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { Suspense, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Progress } from "@repo/ui/components/progress";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { documentMeta } from "@/lib/project-documents";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import type { PartyList } from "@/src/queries/parties";
import {
  QUOTATION_ACCEPT,
  checkQuotationFile,
  partyQuotationsQuery,
  useDeletePartyQuotation,
  useUploadPartyQuotation,
  type Quotation,
} from "@/src/queries/quotations";

import { PARTY_SCREENS, type PartyScreen } from "./party-screens";

/** Where a quotation opens: in the browser when it can, else a download. */
export function quotationOpenUrl(quotation: Quotation): string {
  return quotation.viewable ? quotation.url : `${quotation.url}?download=1`;
}

function QuotationRow({
  quotation,
  onRemove,
}: {
  quotation: Quotation;
  onRemove: (quotation: Quotation) => void;
}) {
  const name = quotation.fileName;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
        <DocumentFileIcon
          fileName={name}
          contentType={quotation.contentType}
          className="size-4"
        />
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={quotationOpenUrl(quotation)}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:underline"
          title={name}
        >
          {name}
        </a>
        <p className="text-muted-foreground truncate text-xs">
          {documentMeta(quotation)}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <a
          href={quotationOpenUrl(quotation)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${name}`}
          title="Open"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ExternalLink aria-hidden="true" />
        </a>
        <a
          href={`${quotation.url}?download=1`}
          download={name}
          aria-label={`Download ${name}`}
          title="Download"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <Download aria-hidden="true" />
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${name}`}
          title="Remove"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            onRemove(quotation);
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function RemoveQuotationDialog({
  screen,
  partyId,
  quotation,
  onClose,
}: {
  screen: PartyScreen;
  partyId: string;
  quotation: Quotation | null;
  onClose: () => void;
}) {
  const removal = useDeletePartyQuotation(screen.list, partyId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(quotation);
  if (quotation != null && quotation !== last) setLast(quotation);
  const shown = quotation ?? last;
  return (
    <AlertDialog
      open={quotation != null}
      onOpenChange={(open) => {
        if (!open) {
          removal.reset();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">
            Remove {shown?.fileName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s removed from this {screen.label} and from View Quotations
            for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert
            message={uploadErrorMessage(
              removal.error,
              "Couldn't remove. Try again.",
            )}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (quotation == null) return;
              removal.mutate(quotation.id, {
                onSuccess: () => {
                  removal.reset();
                  onClose();
                },
              });
            }}
          >
            {removal.isPending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function QuotationList({
  screen,
  partyId,
  onRemove,
}: {
  screen: PartyScreen;
  partyId: string;
  onRemove: (quotation: Quotation) => void;
}) {
  const { data } = useSuspenseQuery(partyQuotationsQuery(screen.list, partyId));
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No quotations yet</EmptyTitle>
          <EmptyDescription>
            Upload the rates this {screen.label} quoted, so you can compare them
            before you give the order.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul
      aria-label="Quotations"
      className="divide-border bg-card divide-y rounded-lg border"
    >
      {data.items.map((quotation) => (
        <QuotationRow
          key={quotation.id}
          quotation={quotation}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

type UploadState =
  | { state: "idle" }
  | { state: "uploading"; fileName: string; progress: number }
  | { state: "refused"; fileName: string; message: string };

/**
 * The Quotations section of Edit Contractor / Edit Supplier (CM-501): the
 * party's quotation files, newest first, with upload (a PDF or an image,
 * up to 10 MB) and remove. Files upload at once; there is nothing to Save.
 */
export function PartyQuotations({
  list,
  partyId,
}: {
  list: PartyList;
  partyId: string;
}) {
  const screen = PARTY_SCREENS[list];
  const upload = useUploadPartyQuotation(list, partyId);
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadState>({ state: "idle" });
  const [removing, setRemoving] = useState<Quotation | null>(null);
  const headingId = `${list}-quotations`;
  const busy = status.state === "uploading";

  const start = async (file: File) => {
    const problem = checkQuotationFile(file);
    if (problem != null) {
      setStatus({
        state: "refused",
        fileName: file.name,
        message: problem.message,
      });
      return;
    }
    setStatus({ state: "uploading", fileName: file.name, progress: 0 });
    try {
      await upload.mutateAsync({
        file,
        onProgress: (progress) => {
          setStatus({ state: "uploading", fileName: file.name, progress });
        },
      });
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "refused",
        fileName: file.name,
        message: uploadErrorMessage(error),
      });
    }
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="font-semibold">
            Quotations
          </h2>
          <p className="text-muted-foreground text-sm">
            A PDF or an image (PNG, JPEG, WebP), up to 10 MB each.
          </p>
        </div>
        <div className="relative shrink-0">
          <Input
            ref={input}
            type="file"
            accept={QUOTATION_ACCEPT}
            aria-label="Quotation file"
            className="sr-only"
            tabIndex={-1}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file != null) void start(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" />
            Upload quotation
          </Button>
        </div>
      </div>

      {status.state === "uploading" ? (
        <div className="space-y-1.5 rounded-lg border px-3 py-2.5 sm:px-4">
          <p className="flex min-w-0 justify-between gap-3 text-sm">
            <span className="truncate font-medium">{status.fileName}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {status.progress >= 100
                ? "Saving…"
                : `${String(status.progress)}%`}
            </span>
          </p>
          <Progress
            value={status.progress}
            aria-label={`Uploading ${status.fileName}`}
          />
        </div>
      ) : null}
      {status.state === "refused" ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border px-3 py-2.5 sm:px-4">
          <div role="alert" className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium" title={status.fileName}>
              {status.fileName}
            </p>
            <p className="text-destructive">{status.message}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Dismiss ${status.fileName}`}
            onClick={() => {
              setStatus({ state: "idle" });
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <Suspense fallback={<Skeleton className="h-14 w-full" />}>
        <QuotationList
          screen={screen}
          partyId={partyId}
          onRemove={setRemoving}
        />
      </Suspense>

      <RemoveQuotationDialog
        screen={screen}
        partyId={partyId}
        quotation={removing}
        onClose={() => {
          setRemoving(null);
        }}
      />
    </section>
  );
}
