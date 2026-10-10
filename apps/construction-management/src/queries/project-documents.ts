import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProjectsDocumentResponseModel,
  ListConstructionProjectsDocumentsResponseModel,
} from "@/app/api/construction/projects/projects/[id]/documents/project-document-models";
import { checkDocumentFile } from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type ProjectDocument = ConstructionProjectsDocumentResponseModel;
export type ProjectDocumentList =
  ListConstructionProjectsDocumentsResponseModel;

/** `/api/construction/projects/projects/{id}/documents` (CM-414). */
export function projectDocumentsPath(projectId: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(projectId)}/documents`;
}

/** Under the Project keys, so saving a Project refreshes its files too. */
export function projectDocumentsKey(projectId: string) {
  return [...PROJECTS_KEY, "documents", projectId] as const;
}

/** The Project's files, newest first, and the bytes they take. */
export function projectDocumentsQuery(projectId: string) {
  return queryOptions({
    queryKey: projectDocumentsKey(projectId),
    queryFn: () =>
      apiJson<ProjectDocumentList>(projectDocumentsPath(projectId)),
  });
}

export {
  UPLOAD_FAILED,
  isUploadCancelled,
  uploadErrorMessage,
  type UploadOptions,
} from "./direct-upload";

/**
 * Keeps one file on a Project (ADR CM-0010) through `directUpload`
 * (CM-407): start (the server checks name, size, count and plan), send the
 * bytes straight to private Blob — or to our route in development — and an
 * image's thumbnail, then complete, which records the document.
 * A program or a file over 25 MB fails here without a request. Errors are
 * `QueryHttpError` with the server's code; a cancelled upload rejects with
 * an `AbortError`.
 */
export async function uploadProjectDocument(
  projectId: string,
  file: File,
  kind: ProjectDocumentKind,
  options: UploadOptions = {},
): Promise<ProjectDocument> {
  const problem = checkDocumentFile(file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = projectDocumentsPath(projectId);
  return directUpload({
    startUrl: `${base}/uploads`,
    startBody: { kind },
    file,
    options,
    complete: (started, signal) =>
      postJson<ProjectDocument>(
        base,
        { key: started.key, kind, fileName: started.fileName },
        signal,
      ),
  });
}

export function deleteProjectDocument(
  projectId: string,
  documentId: string,
): Promise<void> {
  return postJson<undefined>(
    `${projectDocumentsPath(projectId)}/${encodeURIComponent(documentId)}/delete`,
    {},
  );
}

export type UploadProjectDocumentInput = {
  file: File;
  kind: ProjectDocumentKind;
} & UploadOptions;

/** One upload per `mutateAsync` call; several may run at once. */
export function useUploadProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, kind, ...options }: UploadProjectDocumentInput) =>
      uploadProjectDocument(projectId, file, kind, options),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: projectDocumentsKey(projectId),
      }),
  });
}

/** Refreshes the list after a delete, and after a 404 (it is gone anyway). */
export function useDeleteProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: projectDocumentsKey(projectId),
    });
  return useMutation({
    mutationFn: (documentId: string) =>
      deleteProjectDocument(projectId, documentId),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
