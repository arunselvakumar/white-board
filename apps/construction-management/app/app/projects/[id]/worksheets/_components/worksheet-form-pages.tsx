"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { worksheetQuery } from "@/src/queries/worksheets";

import { WorksheetForm } from "./worksheet-form";
import { worksheetsPath } from "./worksheet-format";

/** The saved sheet's page; photos that did not upload ride along to warn about. */
function savedPath(
  projectId: string,
  id: string,
  failed: readonly string[] = [],
): string {
  const query =
    failed.length === 0
      ? ""
      : `?uploadFailed=${encodeURIComponent(failed.slice(0, 20).join("\n"))}`;
  return worksheetsPath(projectId, `/${id}${query}`);
}

/** Add Worksheet, or Duplicate when `fromId` names the source (CM-0016 §9). */
export function NewWorksheetPage({
  projectId,
  fromId,
}: {
  projectId: string;
  fromId: string | null;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {fromId == null ? "Add Worksheet" : "Duplicate Worksheet"}
      </h2>
      {fromId == null ? (
        <WorksheetForm
          projectId={projectId}
          hrefFor={(id, failed) => savedPath(projectId, id, failed)}
        />
      ) : (
        <DuplicateForm projectId={projectId} fromId={fromId} />
      )}
    </div>
  );
}

function DuplicateForm({
  projectId,
  fromId,
}: {
  projectId: string;
  fromId: string;
}) {
  const { data: source } = useSuspenseQuery(worksheetQuery(fromId));
  return (
    <WorksheetForm
      projectId={projectId}
      source={source}
      hrefFor={(id, failed) => savedPath(projectId, id, failed)}
    />
  );
}

/** Edit Worksheet (CM-602). */
export function EditWorksheetPage({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const { data: worksheet } = useSuspenseQuery(worksheetQuery(id));
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Edit {worksheet.number}</h2>
      <WorksheetForm
        projectId={projectId}
        worksheet={worksheet}
        hrefFor={(sheetId) => savedPath(projectId, sheetId)}
      />
    </div>
  );
}
