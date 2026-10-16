import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionReportingBackupResponseModel,
  CreateConstructionReportingBackupRequestModel,
  ListConstructionReportingBackupOptionsResponseModel,
} from "@/app/api/construction/reporting/backups/backup-models";

import { DOWNLOADS_KEY } from "./downloads";
import { apiJson } from "./http";

export type Backup = ConstructionReportingBackupResponseModel;
export type BackupModuleOption =
  ListConstructionReportingBackupOptionsResponseModel["modules"][number];
export type BackupRequest = z.input<
  typeof CreateConstructionReportingBackupRequestModel
>;

export const BACKUPS_API = "/api/construction/reporting/backups";

/**
 * Backups' reads (CM-906). The ready-download toast polls fast while a
 * cached backup under this key is queued or running.
 */
export const BACKUPS_KEY = ["reporting", "backups"] as const;

export function isPreparingBackup(backup: Pick<Backup, "status">): boolean {
  return backup.status === "queued" || backup.status === "running";
}

export const backupQueries = {
  /** What the dialog offers: a Project's modules or the masters. */
  options: (scope: "project" | "masters", projectId?: string) =>
    queryOptions({
      queryKey: [...BACKUPS_KEY, "options", scope, projectId ?? null] as const,
      queryFn: () => {
        const query = new URLSearchParams({ scope });
        if (projectId != null) query.set("projectId", projectId);
        return apiJson<ListConstructionReportingBackupOptionsResponseModel>(
          `${BACKUPS_API}/options?${query.toString()}`,
        );
      },
    }),
  /** One backup, polled every 3 seconds until it is done or failed. */
  one: (id: string) =>
    queryOptions({
      queryKey: [...BACKUPS_KEY, "one", id] as const,
      queryFn: () => apiJson<Backup>(`${BACKUPS_API}/${id}`),
      refetchInterval: (query) =>
        query.state.data != null && isPreparingBackup(query.state.data)
          ? 3_000
          : false,
    }),
};

/** POSTs a backup request; the backup is put in the cache for its poll. */
export function useRequestBackup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BackupRequest) =>
      apiJson<Backup>(BACKUPS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async (backup) => {
      client.setQueryData(backupQueries.one(backup.id).queryKey, backup);
      await client.invalidateQueries({ queryKey: DOWNLOADS_KEY });
    },
  });
}

/** "1.2 MB". */
export function formatBytes(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? "GB"}`;
}
