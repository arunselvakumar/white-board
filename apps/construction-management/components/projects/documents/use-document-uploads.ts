"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { checkDocumentFile } from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";
import {
  isUploadCancelled,
  uploadErrorMessage,
  useUploadProjectDocument,
} from "@/src/queries/project-documents";

export type DocumentUpload = {
  id: string;
  file: File;
  kind: ProjectDocumentKind;
  /** 0–100 while uploading. */
  progress: number;
  state: "uploading" | "done" | "error";
  error?: string;
};

/**
 * Files going up to one Project, each with its own progress, error and
 * retry. A file the browser can already refuse (a program, over 25 MB)
 * becomes an error row without a request. Uploads still running when the
 * screen goes away are cancelled.
 */
export function useDocumentUploads(projectId: string) {
  const mutation = useUploadProjectDocument(projectId);
  const { mutateAsync } = mutation;
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
    };
  }, []);

  const patch = useCallback((id: string, next: Partial<DocumentUpload>) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.id === id ? { ...upload, ...next } : upload,
      ),
    );
  }, []);

  const run = useCallback(
    async (id: string, file: File, kind: ProjectDocumentKind) => {
      const controller = new AbortController();
      controllers.current.set(id, controller);
      try {
        await mutateAsync({
          file,
          kind,
          signal: controller.signal,
          onProgress: (progress) => {
            patch(id, { progress });
          },
        });
        patch(id, { state: "done", progress: 100 });
      } catch (error) {
        if (isUploadCancelled(error)) return;
        patch(id, { state: "error", error: uploadErrorMessage(error) });
      } finally {
        controllers.current.delete(id);
      }
    },
    [mutateAsync, patch],
  );

  const add = useCallback(
    (files: Iterable<File>, kind: ProjectDocumentKind) => {
      const added: DocumentUpload[] = [];
      for (const file of files) {
        const problem = checkDocumentFile(file);
        added.push({
          id: crypto.randomUUID(),
          file,
          kind,
          progress: 0,
          state: problem == null ? "uploading" : "error",
          error: problem?.message,
        });
      }
      setUploads((current) => [...current, ...added]);
      for (const upload of added)
        if (upload.state === "uploading")
          void run(upload.id, upload.file, upload.kind);
    },
    [run],
  );

  const retry = useCallback(
    (id: string) => {
      const upload = uploads.find((candidate) => candidate.id === id);
      if (upload == null || checkDocumentFile(upload.file) != null) return;
      patch(id, { state: "uploading", progress: 0, error: undefined });
      void run(id, upload.file, upload.kind);
    },
    [uploads, patch, run],
  );

  /** Cancels a running upload, or forgets a finished or failed one. */
  const dismiss = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setUploads((current) => current.filter((upload) => upload.id !== id));
  }, []);

  /** Forgets every finished and failed upload; running ones carry on. */
  const clearSettled = useCallback(() => {
    setUploads((current) =>
      current.filter((upload) => upload.state === "uploading"),
    );
  }, []);

  return { uploads, add, retry, dismiss, clearSettled };
}

/** Whether a file can be retried (a refused program or size cannot). */
export function canRetry(upload: DocumentUpload): boolean {
  return upload.state === "error" && checkDocumentFile(upload.file) == null;
}
