"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";
import {
  financeDocumentKey,
  uploadFinanceFile,
  type FinanceDocumentFile,
} from "@/src/queries/finance-documents";

export type PendingUploadResult = {
  uploaded: FinanceDocumentFile[];
  /** Names of the files that did not go up (the document is saved anyway). */
  failed: string[];
};

/**
 * Uploads files picked on a **new** form once the document exists:
 *
 * ```ts
 * const { uploadAll, uploading } = useUploadPendingFinanceFiles("petty_cash_voucher");
 * const saved = await create.mutateAsync(input);
 * const { failed } = await uploadAll(saved.id, values.files);
 * ```
 *
 * One file at a time, in the order picked; a failure never throws, it is
 * named in `failed` so the page can say "2 files did not upload" and the
 * detail page's files section lets the member try again. `done` counts
 * files finished so far, for a "Uploading files 2 of 5" line.
 */
export function useUploadPendingFinanceFiles(type: FinanceDocumentType) {
  const queryClient = useQueryClient();
  const [state, setState] = useState({
    uploading: false,
    done: 0,
    total: 0,
  });
  const uploadAll = useCallback(
    async (
      documentId: string,
      files: readonly File[],
    ): Promise<PendingUploadResult> => {
      const uploaded: FinanceDocumentFile[] = [];
      const failed: string[] = [];
      if (files.length === 0) return { uploaded, failed };
      setState({ uploading: true, done: 0, total: files.length });
      for (const file of files) {
        try {
          uploaded.push(await uploadFinanceFile(type, documentId, file));
        } catch {
          failed.push(file.name);
        }
        setState((current) => ({ ...current, done: current.done + 1 }));
      }
      setState((current) => ({ ...current, uploading: false }));
      await queryClient.invalidateQueries({
        queryKey: financeDocumentKey(type, documentId),
      });
      return { uploaded, failed };
    },
    [type, queryClient],
  );
  return { uploadAll, ...state };
}
