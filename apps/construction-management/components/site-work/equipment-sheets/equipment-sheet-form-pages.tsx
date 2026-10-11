"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import {
  equipmentSheetQuery,
  equipmentSheetsPath,
} from "@/src/queries/equipment-sheets";

import { EquipmentSheetForm } from "./equipment-sheet-form";

/** The saved sheet's page; files that did not upload ride along to warn about. */
function savedPath(
  projectId: string,
  id: string,
  failed: readonly string[] = [],
): string {
  const query =
    failed.length === 0
      ? ""
      : `?uploadFailed=${encodeURIComponent(failed.slice(0, 20).join("\n"))}`;
  return equipmentSheetsPath(projectId, `/${id}${query}`);
}

/** Add usage sheet, or Duplicate when `fromId` names the source (CM-0016 §12). */
export function NewEquipmentSheetPage({
  projectId,
  fromId,
}: {
  projectId: string;
  fromId: string | null;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {fromId == null ? "Add usage sheet" : "Duplicate usage sheet"}
      </h2>
      {fromId == null ? (
        <EquipmentSheetForm
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
  const { data: source } = useSuspenseQuery(equipmentSheetQuery(fromId));
  return (
    <EquipmentSheetForm
      projectId={projectId}
      source={source}
      hrefFor={(id, failed) => savedPath(projectId, id, failed)}
    />
  );
}

/** Edit an Equipment Usage sheet (CM-604). */
export function EditEquipmentSheetPage({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const { data: sheet } = useSuspenseQuery(equipmentSheetQuery(id));
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Edit {sheet.number}</h2>
      <EquipmentSheetForm
        projectId={projectId}
        sheet={sheet}
        hrefFor={(sheetId) => savedPath(projectId, sheetId)}
      />
    </div>
  );
}
