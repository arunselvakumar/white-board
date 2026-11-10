"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type {
  SalesDocumentType,
  SalesFileRole,
} from "@/src/sales/domain/document-files";
import {
  salesDocumentKey,
  uploadSalesFile,
  type SalesDocumentFile,
} from "@/src/queries/sales-documents";

export type PendingSalesFiles = { role: SalesFileRole; files: readonly File[] };

export type PendingSalesUploadResult = {
  uploaded: SalesDocumentFile[];
  /** Names of the files that did not go up (the document is saved anyway). */
  failed: string[];
};

/**
 * Uploads files picked on a **new** inquiry (or booking) form once the
 * document exists, each with its role, one at a time:
 *
 * ```ts
 * const { uploadAll } = useUploadPendingSalesFiles("inquiry");
 * const saved = await create.mutateAsync(input);
 * const { failed } = await uploadAll(saved.id, [
 *   { role: "visiting_card", files: values.card },
 *   { role: "photo", files: values.photos },
 * ]);
 * ```
 *
 * A failure never throws; it is named in `failed`, and the detail page's
 * files section lets the member add it again.
 */
export function useUploadPendingSalesFiles(type: SalesDocumentType) {
  const queryClient = useQueryClient();
  const [state, setState] = useState({ uploading: false, done: 0, total: 0 });
  const uploadAll = useCallback(
    async (
      documentId: string,
      groups: readonly PendingSalesFiles[],
    ): Promise<PendingSalesUploadResult> => {
      const uploaded: SalesDocumentFile[] = [];
      const failed: string[] = [];
      const total = groups.reduce((sum, group) => sum + group.files.length, 0);
      if (total === 0) return { uploaded, failed };
      setState({ uploading: true, done: 0, total });
      for (const group of groups)
        for (const file of group.files) {
          try {
            uploaded.push(
              await uploadSalesFile(type, documentId, group.role, file),
            );
          } catch {
            failed.push(file.name);
          }
          setState((current) => ({ ...current, done: current.done + 1 }));
        }
      setState((current) => ({ ...current, uploading: false }));
      await queryClient.invalidateQueries({
        queryKey: salesDocumentKey(type, documentId),
      });
      return { uploaded, failed };
    },
    [type, queryClient],
  );
  return { uploadAll, ...state };
}
