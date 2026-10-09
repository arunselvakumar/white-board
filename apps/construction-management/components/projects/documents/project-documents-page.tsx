"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Download,
  Eye,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import {
  PROJECT_DOCUMENT_KIND_LABELS,
  documentMeta,
  documentsSummary,
  groupDocumentsByKind,
  paperReference,
} from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";
import {
  projectDocumentsQuery,
  type ProjectDocument,
} from "@/src/queries/project-documents";
import { projectQuery } from "@/src/queries/projects";

import { DeleteDocumentDialog } from "./delete-document-dialog";
import { DocumentFileIcon } from "./document-file-icon";
import { UploadDocumentsDialog } from "./upload-documents-dialog";
import { useDocumentUploads } from "./use-document-uploads";

type Filter = "all" | ProjectDocumentKind;

function downloadUrl(document: ProjectDocument): string {
  return `${document.url}?download=1`;
}

function DocumentRow({
  document,
  canEdit,
  onDelete,
}: {
  document: ProjectDocument;
  canEdit: boolean;
  onDelete: (document: ProjectDocument) => void;
}) {
  const name = document.fileName;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
        <DocumentFileIcon
          fileName={name}
          contentType={document.contentType}
          className="size-4"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {documentMeta(document)}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        {document.viewable ? (
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${name}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Eye aria-hidden="true" />
            View
          </a>
        ) : null}
        <a
          href={downloadUrl(document)}
          download={name}
          aria-label={`Download ${name}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Download aria-hidden="true" />
          Download
        </a>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${name}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              onDelete(document);
            }}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
      <div className="shrink-0 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {document.viewable ? (
              <DropdownMenuItem
                render={
                  <a href={document.url} target="_blank" rel="noreferrer" />
                }
              >
                <Eye aria-hidden="true" />
                View
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              render={<a href={downloadUrl(document)} download={name} />}
            >
              <Download aria-hidden="true" />
              Download
            </DropdownMenuItem>
            {canEdit ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  onDelete(document);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/**
 * The Project's Documents tab (CM-414): every file kept on the Project,
 * grouped under the paper it is a copy of, with that paper's number and
 * date from Contract Details. Upload and Delete need the Project menu's
 * Update flag; everyone who can see the Project can view and download.
 */
export function ProjectDocumentsPage({
  projectId,
  canEdit,
}: {
  projectId: string;
  /** Upload and Delete; false for a read-only Team Member. */
  canEdit: boolean;
}) {
  const { data } = useSuspenseQuery(projectDocumentsQuery(projectId));
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const uploads = useDocumentUploads(projectId);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<ProjectDocument | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const groups = groupDocumentsByKind(data.items);
  // A paper whose last file was deleted drops out of the chips.
  const current =
    filter !== "all" && groups.some((group) => group.kind === filter)
      ? filter
      : "all";
  const shown =
    current === "all"
      ? groups
      : groups.filter((group) => group.kind === current);

  const uploadButton = (label: string) => (
    <Button
      type="button"
      onClick={() => {
        setUploading(true);
      }}
    >
      <Upload aria-hidden="true" />
      {label}
    </Button>
  );

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Documents</h2>
          {data.items.length > 0 ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              {documentsSummary(data.items.length, data.totalBytes)}
            </p>
          ) : null}
        </div>
        {canEdit && data.items.length > 0 ? uploadButton("Upload") : null}
      </div>

      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>
              {canEdit
                ? "Keep this Project's papers here"
                : "No files on this Project yet"}
            </EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? "Upload the quotation, PO / WO, agreement or any other file. Up to 25 MB each."
                : "Quotations, PO / WOs, agreements and other files kept on this Project show here."}
            </EmptyDescription>
          </EmptyHeader>
          {canEdit ? (
            <EmptyContent>{uploadButton("Upload")}</EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <div className="-mx-6 overflow-x-auto px-6 pb-1">
            <ToggleGroup
              aria-label="Paper"
              value={[current]}
              onValueChange={(value: string[]) => {
                const next = value[0] as Filter | undefined;
                if (next != null) setFilter(next);
              }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="all" className="whitespace-nowrap">
                All{" "}
                <span className="text-muted-foreground tabular-nums">
                  {data.items.length}
                </span>
              </ToggleGroupItem>
              {groups.map((group) => (
                <ToggleGroupItem
                  key={group.kind}
                  value={group.kind}
                  className="whitespace-nowrap"
                >
                  {PROJECT_DOCUMENT_KIND_LABELS[group.kind]}{" "}
                  <span className="text-muted-foreground tabular-nums">
                    {group.items.length}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-6">
            {shown.map((group) => {
              const reference = paperReference(group.kind, project);
              const headingId = `documents-${group.kind}`;
              return (
                <section
                  key={group.kind}
                  aria-labelledby={headingId}
                  className="space-y-2"
                >
                  <h3 id={headingId} className="text-sm">
                    <span className="font-medium">
                      {PROJECT_DOCUMENT_KIND_LABELS[group.kind]}
                    </span>
                    {reference.map((part) => (
                      <span key={part} className="text-muted-foreground">
                        {" · "}
                        {part}
                      </span>
                    ))}
                  </h3>
                  <ul className="divide-border bg-card divide-y rounded-lg border">
                    {group.items.map((document) => (
                      <DocumentRow
                        key={document.id}
                        document={document}
                        canEdit={canEdit}
                        onDelete={setDeleting}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="text-muted-foreground text-xs">
            Files aren&apos;t scanned. Only open files from people you trust.
          </p>
        </>
      )}

      {canEdit ? (
        <>
          <UploadDocumentsDialog
            open={uploading}
            onOpenChange={setUploading}
            uploads={uploads}
          />
          <DeleteDocumentDialog
            projectId={projectId}
            document={deleting}
            onClose={() => {
              setDeleting(null);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
