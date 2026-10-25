"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { DocumentSection } from "@/components/procurement/documents/document-section";
import { TrackingEntryFilesField } from "@/components/tracking/documents/tracking-entry-files-field";
import { TrackingFileStrip } from "@/components/tracking/documents/tracking-file-strip";
import { fieldForCode } from "@/lib/server-errors";
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";
import {
  inspectionObservationsQuery,
  inspectionRemarksQuery,
  useAddObservation,
  useAddRemark,
  useDeleteObservation,
} from "@/src/queries/tracking-inspections";
import { INSPECTION_LIMITS } from "@/src/tracking/domain/inspection";

import { instantText } from "./inspection-format";

function Byline({ name, at }: { name: string | null; at: string }) {
  return (
    <p className="text-muted-foreground text-xs">
      {name ?? "A former member"} · {instantText(at)}
    </p>
  );
}

/**
 * **Observations** (CM-0019 §9): what the inspector saw, with photos and
 * files, added while the request is pending by the inspector or anyone
 * with Update; the author may delete their own while it is pending.
 */
export function InspectionObservations({
  inspectionId,
  canObserve,
  canUpload,
}: {
  inspectionId: string;
  /** The inspector or Update, while pending. */
  canObserve: boolean;
  /** Files may come with it: Update, or the request's inspector (CM-804). */
  canUpload: boolean;
}) {
  const headingId = useId();
  return (
    <DocumentSection heading="Observations" headingId={headingId}>
      <ObservationsBody
        inspectionId={inspectionId}
        canObserve={canObserve}
        canUpload={canUpload}
      />
    </DocumentSection>
  );
}

function ObservationsBody({
  inspectionId,
  canObserve,
  canUpload,
}: {
  inspectionId: string;
  canObserve: boolean;
  canUpload: boolean;
}) {
  const { data } = useSuspenseQuery(inspectionObservationsQuery(inspectionId));
  const add = useAddObservation(inspectionId);
  const remove = useDeleteObservation(inspectionId);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<TrackingDocumentFile[]>([]);
  const [problem, setProblem] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  return (
    <div className="space-y-4">
      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No observations yet.</p>
      ) : (
        <ol aria-label="Observations" className="space-y-3">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="bg-card min-w-0 space-y-2 rounded-lg border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <Byline name={item.createdBy.name} at={item.createdAt} />
                {item.canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete this observation"
                    disabled={remove.isPending}
                    onClick={() => {
                      setError(undefined);
                      remove.mutate(item.id, {
                        onError: (failure) => {
                          setError(fieldForCode(failure, {}).message);
                        },
                      });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
              {item.body != null && (
                <p className="text-sm break-words whitespace-pre-line">
                  {item.body}
                </p>
              )}
              <TrackingFileStrip
                files={item.files}
                label={`Files of the observation on ${instantText(item.createdAt)}`}
              />
            </li>
          ))}
        </ol>
      )}
      <FormAlert message={error} />
      {canObserve && (
        <form
          noValidate
          aria-label="Add an observation"
          className="min-w-0 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const text = body.trim();
            if (text === "" && files.length === 0) {
              setProblem("Write the observation, or add a photo or file.");
              return;
            }
            if (text.length > INSPECTION_LIMITS.observation) {
              setProblem(
                `Use at most ${String(INSPECTION_LIMITS.observation)} characters.`,
              );
              return;
            }
            setProblem(undefined);
            setError(undefined);
            add.mutate(
              {
                body: text === "" ? null : text,
                fileIds: files.map((f) => f.id),
              },
              {
                onSuccess: () => {
                  setBody("");
                  setFiles([]);
                },
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
                },
              },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="inspection-observation"
              required={files.length === 0}
            >
              Observation
            </Label>
            <Textarea
              id="inspection-observation"
              rows={3}
              aria-required={files.length === 0}
              value={body}
              maxLength={INSPECTION_LIMITS.observation}
              aria-invalid={problem != null}
              onChange={(event) => {
                setBody(event.target.value);
                setProblem(undefined);
              }}
            />
            <FieldError message={problem} />
          </div>
          {canUpload && (
            <TrackingEntryFilesField
              documentType="inspection"
              documentId={inspectionId}
              label="Inspection images and files"
              value={files}
              onChange={setFiles}
              disabled={add.isPending}
            />
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add observation"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** **Remarks** (CM-0019 §9): text, at any time, by anyone who can read the request. */
export function InspectionRemarks({
  inspectionId,
  canRemark,
}: {
  inspectionId: string;
  canRemark: boolean;
}) {
  const headingId = useId();
  return (
    <DocumentSection heading="Remarks" headingId={headingId}>
      <RemarksBody inspectionId={inspectionId} canRemark={canRemark} />
    </DocumentSection>
  );
}

function RemarksBody({
  inspectionId,
  canRemark,
}: {
  inspectionId: string;
  canRemark: boolean;
}) {
  const { data } = useSuspenseQuery(inspectionRemarksQuery(inspectionId));
  const add = useAddRemark(inspectionId);
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  return (
    <div className="space-y-4">
      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No remarks yet.</p>
      ) : (
        <ol aria-label="Remarks" className="space-y-3">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="min-w-0 space-y-1 border-b pb-3 last:border-0"
            >
              <Byline name={item.createdBy.name} at={item.createdAt} />
              <p className="text-sm break-words whitespace-pre-line">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      )}
      <FormAlert message={error} />
      {canRemark && (
        <form
          noValidate
          aria-label="Add a remark"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const text = body.trim();
            if (text === "") {
              setProblem("Write the remark.");
              return;
            }
            if (text.length > INSPECTION_LIMITS.remark) {
              setProblem(
                `Use at most ${String(INSPECTION_LIMITS.remark)} characters.`,
              );
              return;
            }
            setProblem(undefined);
            setError(undefined);
            add.mutate(text, {
              onSuccess: () => {
                setBody("");
              },
              onError: (failure) => {
                setError(fieldForCode(failure, {}).message);
              },
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="inspection-remark" required>
              Remark
            </Label>
            <Textarea
              id="inspection-remark"
              rows={2}
              aria-required
              value={body}
              maxLength={INSPECTION_LIMITS.remark}
              aria-invalid={problem != null}
              onChange={(event) => {
                setBody(event.target.value);
                setProblem(undefined);
              }}
            />
            <FieldError message={problem} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add remark"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
