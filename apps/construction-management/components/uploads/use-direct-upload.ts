"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isUploadCancelled,
  uploadErrorMessage,
  type UploadOptions,
} from "@/src/queries/direct-upload";
import { QueryHttpError } from "@/src/queries/http";

/** A problem the browser can see before any byte moves. */
export type UploadFileProblem = { code: string; message: string };

/** One file going up, with what the form attached to it (`Meta`). */
export type DirectUploadItem<Meta extends object> = Meta & {
  id: string;
  file: File;
  /** 0–100 while uploading. */
  progress: number;
  state: "uploading" | "done" | "error";
  error?: string;
  /** False when trying the same bytes again cannot help. */
  retryable?: boolean;
};

/** The server refused the file itself: a program, too big, empty, wrong type. */
const FINAL_CODES = new Set([
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_TOO_LARGE",
  "FILE_EMPTY",
]);

/**
 * Files going up through the attachments service (CM-407), each with its
 * own progress, error, retry and cancel. `upload` runs one file (usually
 * `directUpload` with the owner's start and completion routes, which
 * splits large files into parts and sends an image's thumbnail); `check`
 * refuses what the browser can already tell is wrong, without a request.
 * Uploads still running when the screen goes away are cancelled.
 */
export function useDirectUpload<Meta extends object, Result>(options: {
  upload: (file: File, meta: Meta, options: UploadOptions) => Promise<Result>;
  check?: (file: File) => UploadFileProblem | null;
  onUploaded?: (result: Result, item: DirectUploadItem<Meta>) => void;
}) {
  const { upload, check, onUploaded } = options;
  const [uploads, setUploads] = useState<DirectUploadItem<Meta>[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
    };
  }, []);

  const patch = useCallback(
    (id: string, next: Partial<DirectUploadItem<Meta>>) => {
      setUploads((current) =>
        current.map((item) => (item.id === id ? { ...item, ...next } : item)),
      );
    },
    [],
  );

  const run = useCallback(
    async (item: DirectUploadItem<Meta>, meta: Meta) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      try {
        const result = await upload(item.file, meta, {
          signal: controller.signal,
          onProgress: (progress) => {
            patch(item.id, { progress } as Partial<DirectUploadItem<Meta>>);
          },
        });
        patch(item.id, { state: "done", progress: 100 } as Partial<
          DirectUploadItem<Meta>
        >);
        onUploaded?.(result, item);
      } catch (error) {
        if (isUploadCancelled(error)) return;
        patch(item.id, {
          state: "error",
          error: uploadErrorMessage(error),
          retryable: !(
            error instanceof QueryHttpError && FINAL_CODES.has(error.code)
          ),
        } as Partial<DirectUploadItem<Meta>>);
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [upload, patch, onUploaded],
  );

  const add = useCallback(
    (files: Iterable<File>, meta: Meta) => {
      const added: DirectUploadItem<Meta>[] = [];
      for (const file of files) {
        const problem = check?.(file) ?? null;
        added.push({
          ...meta,
          id: crypto.randomUUID(),
          file,
          progress: 0,
          state: problem == null ? "uploading" : "error",
          error: problem?.message,
        });
      }
      setUploads((current) => [...current, ...added]);
      for (const item of added)
        if (item.state === "uploading") void run(item, meta);
    },
    [check, run],
  );

  const retry = useCallback(
    (id: string) => {
      const item = uploads.find((candidate) => candidate.id === id);
      if (item == null || check?.(item.file) != null) return;
      patch(id, {
        state: "uploading",
        progress: 0,
        error: undefined,
      } as Partial<DirectUploadItem<Meta>>);
      void run(item, item);
    },
    [uploads, check, patch, run],
  );

  /** Cancels a running upload, or forgets a finished or failed one. */
  const dismiss = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setUploads((current) => current.filter((item) => item.id !== id));
  }, []);

  /** Forgets every finished and failed upload; running ones carry on. */
  const clearSettled = useCallback(() => {
    setUploads((current) =>
      current.filter((item) => item.state === "uploading"),
    );
  }, []);

  /** Whether a failed file can be tried again (a refused one cannot). */
  const canRetry = useCallback(
    (item: DirectUploadItem<Meta>) =>
      item.state === "error" &&
      item.retryable !== false &&
      check?.(item.file) == null,
    [check],
  );

  return { uploads, add, retry, dismiss, clearSettled, canRetry };
}
