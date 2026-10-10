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
import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  REMARK_FILES_MAX,
  checkDocumentUpload,
  documentRemarksQuery,
  uploadDocumentFile,
  useAddDocumentRemark,
  useRemoveDocumentFile,
  type DocumentFile,
  type DocumentRemark,
} from "@/src/queries/procurement-documents";

import { FileChip, openHref, viewable } from "./document-file-parts";
import { DocumentSection } from "./document-section";
import { remarkFullTime, remarkTime } from "./document-time";

const MAX = APPROVAL_LIMITS.maxTextLength;

const remarkSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a few words.")
    .max(MAX, `Use at most ${String(MAX)} characters.`),
});

type RemarkValues = z.infer<typeof remarkSchema>;

type Props = {
  documentType: ProcurementDocumentType;
  documentId: string;
  heading: "Remarks" | "Comments";
};

/** "remark" or "comment", as the heading says. */
function noun(heading: Props["heading"]): string {
  return heading === "Remarks" ? "remark" : "comment";
}

/**
 * The remarks / comments thread of a document, oldest first, newest last,
 * with a box to add one (anyone who can see the document may write) and,
 * with Create or Update on it, photos or files to post with it.
 */
export function DocumentThreadView(props: Props) {
  const headingId = useId();
  return (
    <DocumentSection heading={props.heading} headingId={headingId}>
      <ThreadBody {...props} />
    </DocumentSection>
  );
}

function ThreadBody({ documentType, documentId, heading }: Props) {
  const { data } = useSuspenseQuery(
    documentRemarksQuery(documentType, documentId),
  );
  const [opened, setOpened] = useState<DocumentFile | null>(null);
  const word = noun(heading);
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
                else window.open(openHref(file), "_blank", "noreferrer");
              }}
            />
          ))}
        </ol>
      )}
      {data.canComment ? (
        <Composer
          documentType={documentType}
          documentId={documentId}
          heading={heading}
          canAttach={data.canAttach}
        />
      ) : null}
      <FileViewer
        file={opened == null ? null : viewable(opened)}
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
  remark: DocumentRemark;
  onOpen: (file: DocumentFile) => void;
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
  heading,
  canAttach,
}: Props & { canAttach: boolean }) {
  const word = noun(heading);
  const fieldId = useId();
  const input = useRef<HTMLInputElement>(null);
  const post = useAddDocumentRemark(documentType, documentId);
  const removal = useRemoveDocumentFile(documentType, documentId);
  const [saved, setSaved] = useState<Map<string, DocumentFile>>(new Map());
  const { uploads, add, retry, dismiss, canRetry, clearSettled } =
    useDirectUpload<object, DocumentFile>({
      upload: (file, _meta, options) =>
        uploadDocumentFile(documentType, documentId, file, options),
      check: checkDocumentUpload,
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
  const full = uploads.length >= REMARK_FILES_MAX;

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
      className="space-y-2"
      noValidate
    >
      <Label htmlFor={fieldId} className="sr-only">
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
              aria-label={`Choose files for the ${word}`}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []).slice(
                  0,
                  REMARK_FILES_MAX - uploads.length,
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
