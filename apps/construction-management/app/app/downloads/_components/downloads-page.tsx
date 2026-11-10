"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { CircleAlert, Download } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Spinner } from "@repo/ui/components/spinner";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  downloadsQuery,
  useDeleteDownload,
  useRetryDownload,
  type DownloadItem,
} from "@/src/queries/downloads";

import { DownloadRow } from "./download-row";

/** The user menu's Downloads (CM-901). */
export const DOWNLOADS_PATH = "/app/downloads";

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

/**
 * Downloads (ADR CM-0021 §2, CM-901): every report the signed-in member
 * asked for, on any Project or central, newest first, with its status,
 * Excel / PDF downloads, Retry and Delete. It polls while one is being
 * generated. Report files are kept 30 days; Progress Reports until
 * deleted.
 */
export function DownloadsPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(downloadsQuery);
  const items = data.pages.flatMap((page) => page.items);
  const retry = useRetryDownload();
  const remove = useDeleteDownload();
  const [deleting, setDeleting] = useState<DownloadItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-4xl min-w-0 space-y-6">
        <PageHeader
          title="Downloads"
          meta="Reports you asked for, on every Project. Report files are kept 30 days after they are ready; Progress Reports until someone deletes them."
        />
        {error == null ? null : (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Could not do that</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {items.length === 0 ? (
          <Empty className="bg-card border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Download />
              </EmptyMedia>
              <EmptyTitle>Nothing to download yet</EmptyTitle>
              <EmptyDescription>
                Reports you generate on any Project, or centrally, appear here
                with their Excel and PDF.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            aria-label="Downloads"
            className="bg-card divide-y rounded-xl border"
          >
            {items.map((item) => (
              <DownloadRow
                key={`${item.source}:${item.id}`}
                item={item}
                retrying={retry.isPending && retry.variables.id === item.id}
                onRetry={(target) => {
                  setError(null);
                  retry.mutate(target, {
                    onError: (caught) => {
                      setError(messageOf(caught));
                    },
                  });
                }}
                onDelete={(target) => {
                  setError(null);
                  setDeleting(target);
                }}
              />
            ))}
          </ul>
        )}
        {hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => {
              void fetchNextPage();
            }}
          >
            {isFetchingNextPage ? <Spinner aria-hidden="true" /> : null}
            Show older
          </Button>
        ) : null}
      </div>
      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting == null ? "" : deleting.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting == null ? "" : `${deleting.detail}. `}
              Its files are deleted; you can generate it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting == null) return;
                remove.mutate(deleting, {
                  onSettled: () => {
                    setDeleting(null);
                  },
                  onError: (caught) => {
                    setError(messageOf(caught));
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
