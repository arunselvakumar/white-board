import type { BackupJob, BackupPart } from "./backup-job";
import { backupModule } from "./backup-modules";

/** `manifest.json` at the top of every backup ZIP (ADR CM-0021 §8). */
export type BackupManifest = {
  format: "construction-management-backup";
  version: 1;
  backupId: string;
  scope: BackupJob["scope"];
  company: { id: string; name: string | null } | null;
  project: { id: string; name: string | null } | null;
  range: { from: string | null; to: string | null };
  includes: { data: boolean; media: boolean; amounts: boolean };
  requestedBy: { userId: string; name: string | null };
  requestedAt: string;
  generatedAt: string;
  modules: {
    key: string;
    label: string;
    amounts: boolean;
    mediaFiles: number;
    entities: { entity: string; rows: number }[];
  }[];
  totalRows: number;
  notes: string[];
};

export function buildBackupManifest(input: {
  job: BackupJob;
  parts: readonly BackupPart[];
  companyName: string | null;
  projectName: string | null;
  requesterName: string | null;
  generatedAt: Date;
}): BackupManifest {
  const { job } = input;
  const modules = input.parts.map((part) => ({
    key: part.module,
    label:
      backupModule(part.module)?.label ??
      (part.module === "my_data" ? "My data" : part.module),
    amounts: part.money,
    mediaFiles: part.mediaFiles,
    entities: part.entities,
  }));
  const notes = [
    "CSV files use the screens' labels; amounts are in rupees with two decimals.",
    "JSON files keep the raw field names and ids.",
    "Deleted records are not included.",
  ];
  if (
    input.parts.some(
      (part) => !part.money && backupModule(part.module)?.money != null,
    )
  )
    notes.push(
      "Amounts are left out of modules you have no Financial right on.",
    );
  return {
    format: "construction-management-backup",
    version: 1,
    backupId: job.id,
    scope: job.scope,
    company:
      job.workspaceId == null
        ? null
        : { id: job.workspaceId, name: input.companyName },
    project:
      job.projectId == null
        ? null
        : { id: job.projectId, name: input.projectName },
    range: { from: job.fromDate, to: job.toDate },
    includes: {
      data: job.includeData,
      media: job.includeMedia,
      amounts: input.parts.some((part) => part.money),
    },
    requestedBy: { userId: job.requestedBy, name: input.requesterName },
    requestedAt: job.createdAt.toISOString(),
    generatedAt: input.generatedAt.toISOString(),
    modules,
    totalRows: modules.reduce(
      (sum, module) =>
        sum + module.entities.reduce((rows, entity) => rows + entity.rows, 0),
      0,
    ),
    notes,
  };
}
