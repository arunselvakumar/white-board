"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Camera,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Progress } from "@repo/ui/components/progress";

import { DocumentFileIcon } from "@/app/app/_components/projects/documents/document-file-icon";
import { FileThumbnail } from "@/app/app/_components/projects/files/file-thumbnail";
import {
  downloadUrl,
  FileViewer,
} from "@/app/app/_components/projects/files/file-viewer";
import { useDirectUpload } from "@/app/app/_components/uploads/use-direct-upload";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { formatBytes } from "@/lib/project-documents";
import { VISIT_CAPTION_MAX } from "@/src/marketing/domain/visit-files";
import {
  VISIT_FILE_ACCEPT,
  VISIT_FILE_HINT,
  VISIT_FILE_LIMIT,
  VISIT_PHOTO_ACCEPT,
  checkVisitFile,
  uploadVisitFile,
  useRefreshVisitFiles,
  useRemoveVisitFile,
  useUpdateVisitFileCaption,
  viewableVisitFile,
  type VisitFile,
} from "@/src/queries/marketing-visit-files";
import { visitErrorMessage, type Visit } from "@/src/queries/marketing-visits";

const HEADING_ID = "visit-photos-and-files-heading";

/** "Ravi Shankar · 420 KB". */
function byline(file: VisitFile): string {
  return `${file.createdByName} · ${formatBytes(file.bytes)}`;
}

/** A finished upload's file, and whether reading the Visit again failed. */
type SavedUpload = { fileId: string; refreshFailed: boolean };

const REFRESH_FAILED =
  "Saved, but the Visit could not be refreshed. Try again.";

/**
 * A Visit's photos and files: thumbnails that open in the viewer, each
 * with its caption and uploader. With `canAddFiles`, files upload at once
 * with progress, and on a touch screen **Take photo** opens the camera.
 * The uploader, or View all, can edit a caption or remove a file.
 */
export function VisitFiles({ visit }: { visit: Visit }) {
  const refresh = useRefreshVisitFiles(visit.id);
  const chooser = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [opened, setOpened] = useState<VisitFile | null>(null);
  const [captioning, setCaptioning] = useState<VisitFile | null>(null);
  const [removing, setRemoving] = useState<VisitFile | null>(null);
  const [saved, setSaved] = useState<ReadonlyMap<string, SavedUpload>>(
    () => new Map(),
  );
  const { uploads, add, retry, dismiss, canRetry } = useDirectUpload<
    object,
    VisitFile
  >({
    upload: (file, _meta, options) => uploadVisitFile(visit.id, file, options),
    check: checkVisitFile,
    onUploaded: (file, item) => {
      showWhenListed(item.id, file.id);
    },
  });

  function markSaved(uploadId: string, next: SavedUpload | null) {
    setSaved((current) => {
      const changed = new Map(current);
      if (next == null) changed.delete(uploadId);
      else changed.set(uploadId, next);
      return changed;
    });
  }

  /** Reads the Visit again; the upload stays until its file is listed. */
  function showWhenListed(uploadId: string, fileId: string) {
    markSaved(uploadId, { fileId, refreshFailed: false });
    refresh().then(
      () => {
        dismiss(uploadId);
        markSaved(uploadId, null);
      },
      () => {
        markSaved(uploadId, { fileId, refreshFailed: true });
      },
    );
  }

  const files = visit.files;
  const listed = new Set(files.map((file) => file.id));
  const pending = uploads.filter((upload) => {
    if (upload.state !== "done") return true;
    const done = saved.get(upload.id);
    return done != null && !listed.has(done.fileId);
  });
  const full = files.length >= VISIT_FILE_LIMIT;
  const mayAdd = visit.actions.canAddFiles;

  const pick = (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []);
    input.value = "";
    if (picked.length > 0) add(picked, {});
  };

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <h2 id={HEADING_ID} className="font-semibold">
        Photos and files
      </h2>
      {files.length === 0 && pending.length === 0 ? (
        <p className="text-muted-foreground text-sm">No photos or files yet.</p>
      ) : (
        <ul
          aria-label="Photos and files"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
        >
          {files.map((file) => {
            const shown = viewableVisitFile(visit.id, file);
            return (
              <li key={file.id} className="relative min-w-0">
                <a
                  href={file.viewable ? shown.url : downloadUrl(shown)}
                  target={file.viewable ? undefined : "_blank"}
                  rel="noreferrer"
                  aria-label={`Open ${file.fileName}`}
                  className="group focus-visible:ring-ring/50 block min-w-0 rounded-lg focus-visible:ring-3 focus-visible:outline-none"
                  onClick={(event) => {
                    if (!file.viewable) return;
                    event.preventDefault();
                    setOpened(file);
                  }}
                >
                  <FileThumbnail
                    file={shown}
                    className="w-full border group-hover:opacity-90"
                  />
                  <span className="mt-1.5 block truncate text-sm font-medium">
                    {file.fileName}
                  </span>
                </a>
                {file.caption != null && (
                  <p className="line-clamp-2 text-sm break-words">
                    {file.caption}
                  </p>
                )}
                <p className="text-muted-foreground truncate text-xs">
                  {byline(file)}
                </p>
                {file.canChange && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-xs"
                          aria-label={`Change ${file.fileName}`}
                          className="absolute top-1.5 right-1.5 shadow-sm"
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => {
                          setCaptioning(file);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                        Edit caption
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setRemoving(file);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
          {pending.map((upload) => (
            <li
              key={upload.id}
              className="min-w-0"
              aria-label={`Uploading ${upload.file.name}`}
            >
              <span className="bg-muted text-muted-foreground flex aspect-square items-center justify-center rounded-md border">
                <DocumentFileIcon
                  fileName={upload.file.name}
                  contentType={upload.file.type}
                  className="size-1/3 max-h-10 max-w-10"
                />
              </span>
              <span className="mt-1.5 block truncate text-sm font-medium">
                {upload.file.name}
              </span>
              {upload.state === "error" ? (
                <span role="alert" className="text-destructive block text-xs">
                  {upload.error}
                </span>
              ) : saved.get(upload.id)?.refreshFailed === true ? (
                <span role="alert" className="text-destructive block text-xs">
                  {REFRESH_FAILED}
                </span>
              ) : (
                <Progress
                  value={upload.progress}
                  aria-label={`${upload.file.name} upload`}
                  className="mt-1"
                />
              )}
              <span className="mt-1 flex gap-1">
                {saved.get(upload.id)?.refreshFailed === true && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Retry ${upload.file.name}`}
                    onClick={() => {
                      const done = saved.get(upload.id);
                      if (done != null) showWhenListed(upload.id, done.fileId);
                    }}
                  >
                    <RotateCw />
                  </Button>
                )}
                {canRetry(upload) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Retry ${upload.file.name}`}
                    onClick={() => {
                      retry(upload.id);
                    }}
                  >
                    <RotateCw />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Dismiss ${upload.file.name}`}
                  onClick={() => {
                    dismiss(upload.id);
                    markSaved(upload.id, null);
                  }}
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {mayAdd && (
        <div className="relative space-y-1.5">
          <Input
            ref={chooser}
            type="file"
            multiple
            accept={VISIT_FILE_ACCEPT}
            aria-label="Choose photos or files"
            className="sr-only top-0 left-0"
            tabIndex={-1}
            disabled={full}
            onChange={(event) => {
              pick(event.target);
            }}
          />
          <Input
            ref={camera}
            type="file"
            accept={VISIT_PHOTO_ACCEPT}
            capture="environment"
            aria-label="Take a photo with the camera"
            className="sr-only top-0 left-0"
            tabIndex={-1}
            disabled={full}
            onChange={(event) => {
              pick(event.target);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              onClick={() => chooser.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              Add photos or files
            </Button>
            {/* The camera is for touch screens: phones and tablets. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              className="hidden pointer-coarse:inline-flex"
              onClick={() => camera.current?.click()}
            >
              <Camera aria-hidden="true" />
              Take photo
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {full
              ? `This Visit has ${String(VISIT_FILE_LIMIT)} photos and files. Remove one to add another.`
              : VISIT_FILE_HINT}
          </p>
        </div>
      )}
      <FileViewer
        file={opened == null ? null : viewableVisitFile(visit.id, opened)}
        description={
          opened == null
            ? undefined
            : [opened.caption, byline(opened)]
                .filter((part) => part != null)
                .join(" · ")
        }
        onClose={() => {
          setOpened(null);
        }}
      />
      <CaptionDialog
        key={captioning?.id ?? "none"}
        visitId={visit.id}
        file={captioning}
        onClose={(fileId) => {
          // A save that finishes late must not close another file's dialog.
          setCaptioning((current) => (current?.id === fileId ? null : current));
        }}
      />
      <RemoveVisitFileDialog
        visitId={visit.id}
        file={removing}
        onClose={(fileId) => {
          setRemoving((current) => (current?.id === fileId ? null : current));
        }}
      />
    </section>
  );
}

const captionSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(
      VISIT_CAPTION_MAX,
      `Keep the caption to ${String(VISIT_CAPTION_MAX)} characters.`,
    ),
});
type CaptionValues = z.infer<typeof captionSchema>;

/** Sets or clears one file's caption. */
function CaptionDialog({
  visitId,
  file,
  onClose,
}: {
  visitId: string;
  file: VisitFile | null;
  /** Closes the dialog if `fileId` is still the one open. */
  onClose: (fileId: string) => void;
}) {
  const update = useUpdateVisitFileCaption(visitId);
  const close = () => {
    if (file != null) onClose(file.id);
  };
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CaptionValues>({
    resolver: zodResolver(captionSchema),
    defaultValues: { caption: file?.caption ?? "" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    if (file == null) return;
    setError(null);
    try {
      await update.mutateAsync({
        fileId: file.id,
        caption: values.caption === "" ? null : values.caption,
      });
      onClose(file.id);
    } catch (caught) {
      setError(visitErrorMessage(caught));
    }
  });

  return (
    <Dialog
      open={file != null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          aria-label="Edit caption"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit caption</DialogTitle>
            <DialogDescription className="break-all">
              {file?.fileName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="visit-file-caption">Caption</Label>
            <Input
              id="visit-file-caption"
              placeholder="Visiting card of the purchase manager"
              aria-invalid={errors.caption != null}
              {...form.register("caption")}
            />
            <FieldError message={errors.caption?.message} />
          </div>
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Remove {file}?" before a file goes for everyone. */
function RemoveVisitFileDialog({
  visitId,
  file,
  onClose,
}: {
  visitId: string;
  file: VisitFile | null;
  /** Closes the dialog if `fileId` is still the one open. */
  onClose: (fileId: string) => void;
}) {
  const removal = useRemoveVisitFile(visitId);
  // Kept after closing so the title stays while the dialog animates out.
  const [last, setLast] = useState(file);
  if (file != null && file !== last) setLast(file);
  const shown = file ?? last;
  return (
    <AlertDialog
      open={file != null}
      onOpenChange={(open) => {
        if (!open && file != null) {
          removal.reset();
          onClose(file.id);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">
            Remove {shown?.fileName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s removed from the Visit for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError && (
          <FormAlert message={visitErrorMessage(removal.error)} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (file == null) return;
              const fileId = file.id;
              removal.mutate(fileId, {
                onSuccess: () => {
                  removal.reset();
                  onClose(fileId);
                },
              });
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
