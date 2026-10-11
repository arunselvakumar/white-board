"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { initials } from "@/components/app-shell/user-menu";
import { FormAlert } from "@/components/auth/form-alert";
import { FileViewer } from "@/components/projects/files/file-viewer";
import { useDirectUpload } from "@/components/uploads/use-direct-upload";
import { formatBytes } from "@/lib/project-documents";
import { FileChip } from "@/components/procurement/documents/document-file-parts";
import { DocumentSection } from "@/components/procurement/documents/document-section";
import {
  remarkFullTime,
  remarkTime,
} from "@/components/procurement/documents/document-time";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  SITE_WORK_REMARK_FILES_MAX,
  checkSiteWorkFile,
  siteWorkFileInputAccept,
  siteWorkRemarksQuery,
  takesImagesOnly,
  uploadSiteWorkFile,
  useAddSiteWorkRemark,
  useRemoveSiteWorkFile,
  type SiteWorkDocumentFile,
  type SiteWorkRemark,
} from "@/src/queries/site-work-documents";
import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

import { siteWorkOpenHref, siteWorkViewable } from "./site-work-file-parts";

const MAX = APPROVAL_LIMITS.maxTextLength;

const remarkSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a few words.")
    .max(MAX, `Use at most ${String(MAX)} characters.`),
});

type RemarkValues = z.infer<typeof remarkSchema>;

export type SiteWorkDocumentRemarksProps = {
  documentType: SiteWorkDocumentType;
  documentId: string;
  /** "Remarks" unless given. */
  heading?: string;
};

type Props = Required<SiteWorkDocumentRemarksProps>;

/**
 * The remarks thread of a site-work document (CM-0016 §8), oldest first,
 * newest last, with a box to add one (anyone who can read the document may
 * write) and, with Create or Update on it, photos (or PDFs on a usage
 * sheet or hindrance) to post with it.
 */
export function SiteWorkDocumentRemarks({
  heading = "Remarks",
  ...props
}: SiteWorkDocumentRemarksProps) {
  const headingId = useId();
  return (
    <DocumentSection heading={heading} headingId={headingId}>
      <ThreadBody {...props} heading={heading} />
    </DocumentSection>
  );
}

function ThreadBody({ documentType, documentId, heading }: Props) {
  const { data } = useSuspenseQuery(
    siteWorkRemarksQuery(documentType, documentId),
  );
  const [opened, setOpened] = useState<SiteWorkDocumentFile | null>(null);
  const word = "remark";
  return (
    <div className="space-y-4">
      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No {word}s yet.
          {data.canComment ? ` Write the first ${word} below.` : null}
        </p>
      ) : (
        <ol aria-label={heading} className="space-y-4">
          {data.items.map((remark) => (
            <RemarkItem
              key={remark.id}
              remark={remark}
              onOpen={(file) => {
                if (file.viewable) setOpened(file);
                else
                  window.open(siteWorkOpenHref(file), "_blank", "noreferrer");
              }}
            />
          ))}
        </ol>
      )}
      {data.canComment ? (
        <Composer
          documentType={documentType}
          documentId={documentId}
          canAttach={data.canAttach}
        />
      ) : null}
      <FileViewer
        file={opened == null ? null : siteWorkViewable(opened)}
        onClose={() => {
          setOpened(null);
        }}
      />
    </div>
  );
}

function RemarkItem({
  remark,
  onOpen,
}: {
  remark: SiteWorkRemark;
  onOpen: (file: SiteWorkDocumentFile) => void;
}) {
  const name = remark.createdByName ?? "Former Team Member";
  return (
    <li className="flex min-w-0 gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {initials(name) || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{name}</span>
          <time
            dateTime={remark.createdAt}
            title={remarkFullTime(remark.createdAt)}
            className="text-muted-foreground text-xs"
          >
            {remarkTime(remark.createdAt)}
          </time>
        </p>
        <p className="text-sm break-words whitespace-pre-wrap">{remark.body}</p>
        {remark.files.length > 0 ? (
          <ul
            aria-label={`Files with ${name}'s ${remark.body.slice(0, 20)}`}
            className="flex flex-wrap gap-2 pt-1"
          >
            {remark.files.map((file) => (
              <FileChip
                key={file.id}
                fileName={file.fileName}
                contentType={file.contentType}
                file={file}
                description={formatBytes(file.bytes)}
                state="done"
                onOpen={() => {
                  onOpen(file);
                }}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function Composer({
  documentType,
  documentId,
  canAttach,
}: Omit<Props, "heading"> & { canAttach: boolean }) {
  const word = "remark";
  const fieldId = useId();
  const input = useRef<HTMLInputElement>(null);
  const post = useAddSiteWorkRemark(documentType, documentId);
  const removal = useRemoveSiteWorkFile(documentType, documentId);
  const [saved, setSaved] = useState<Map<string, SiteWorkDocumentFile>>(
    new Map(),
  );
  const { uploads, add, retry, dismiss, canRetry, clearSettled } =
    useDirectUpload<object, SiteWorkDocumentFile>({
      upload: (file, _meta, options) =>
        uploadSiteWorkFile(documentType, documentId, file, options),
      check: (file) => checkSiteWorkFile(documentType, file),
      onUploaded: (file, item) => {
        setSaved((current) => new Map(current).set(item.id, file));
      },
    });
  const form = useForm<RemarkValues>({
    resolver: zodResolver(remarkSchema),
    defaultValues: { body: "" },
  });
  const body = useWatch({ control: form.control, name: "body" });
  const uploading = uploads.some((upload) => upload.state === "uploading");
  const fileIds = uploads.flatMap((upload) => {
    const file = saved.get(upload.id);
    return file == null ? [] : [file.id];
  });
  const full = uploads.length >= SITE_WORK_REMARK_FILES_MAX;

  const submit = form.handleSubmit((values) => {
    post.mutate(
      { body: values.body, fileIds },
      {
        onSuccess: () => {
          form.reset({ body: "" });
          clearSettled();
          setSaved(new Map());
        },
      },
    );
  });

  const error = form.formState.errors.body?.message;
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="relative space-y-2"
      noValidate
    >
      <Label htmlFor={fieldId} className="sr-only top-0 left-0">
        Add a {word}
      </Label>
      <Textarea
        id={fieldId}
        rows={3}
        placeholder={`Add a ${word}…`}
        aria-invalid={error != null}
        aria-describedby={`${fieldId}-count`}
        {...form.register("body")}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-destructive">{error}</span>
        <span
          id={`${fieldId}-count`}
          className={
            body.length > MAX ? "text-destructive" : "text-muted-foreground"
          }
        >
          {body.length}/{MAX}
        </span>
      </div>
      {uploads.length > 0 ? (
        <ul aria-label={`Files to post`} className="flex flex-wrap gap-2">
          {uploads.map((upload) => {
            const file = saved.get(upload.id);
            return (
              <FileChip
                key={upload.id}
                fileName={upload.file.name}
                contentType={file?.contentType ?? upload.file.type}
                {...(file == null ? {} : { file })}
                description={
                  upload.state === "error"
                    ? upload.error
                    : upload.state === "done"
                      ? formatBytes(upload.file.size)
                      : `Uploading ${String(upload.progress)}%`
                }
                state={upload.state}
                {...(canRetry(upload)
                  ? {
                      retry: () => {
                        retry(upload.id);
                      },
                    }
                  : {})}
                remove={{
                  label:
                    upload.state === "uploading"
                      ? `Cancel upload of ${upload.file.name}`
                      : `Remove ${upload.file.name}`,
                  onClick: () => {
                    dismiss(upload.id);
                    if (file != null) {
                      removal.mutate(file.id);
                      setSaved((current) => {
                        const next = new Map(current);
                        next.delete(upload.id);
                        return next;
                      });
                    }
                  },
                }}
              />
            );
          })}
        </ul>
      ) : null}
      {post.isError ? (
        <FormAlert
          message={uploadErrorMessage(post.error, "Couldn't post. Try again.")}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canAttach ? (
          <>
            <Input
              ref={input}
              type="file"
              multiple
              accept={siteWorkFileInputAccept(documentType)}
              aria-label={`Choose ${takesImagesOnly(documentType) ? "photos" : "files"} for the ${word}`}
              className="sr-only top-0 left-0"
              tabIndex={-1}
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []).slice(
                  0,
                  SITE_WORK_REMARK_FILES_MAX - uploads.length,
                );
                event.target.value = "";
                if (picked.length > 0) add(picked, {});
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={full}
              onClick={() => input.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              Attach
            </Button>
          </>
        ) : null}
        <Button type="submit" disabled={post.isPending || uploading}>
          {post.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
