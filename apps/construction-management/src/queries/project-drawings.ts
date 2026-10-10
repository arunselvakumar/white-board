import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProjectsDrawingAlbumResponseModel,
  ConstructionProjectsDrawingResponseModel,
  ConstructionProjectsDrawingRevisionResponseModel,
  GetConstructionProjectsDrawingAlbumResponseModel,
  GetConstructionProjectsDrawingResponseModel,
  ListConstructionProjectsDrawingAlbumsResponseModel,
} from "@/app/api/construction/projects/projects/[id]/drawings/drawing-models";
import { checkUploadFile } from "@/lib/project-uploads";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type DrawingAlbum = ConstructionProjectsDrawingAlbumResponseModel;
export type DrawingAlbumList =
  ListConstructionProjectsDrawingAlbumsResponseModel;
export type DrawingAlbumDetail =
  GetConstructionProjectsDrawingAlbumResponseModel;
export type DrawingSummary = ConstructionProjectsDrawingResponseModel;
export type DrawingDetail = GetConstructionProjectsDrawingResponseModel;
export type DrawingRevision = ConstructionProjectsDrawingRevisionResponseModel;

/** `/api/construction/projects/projects/{id}/drawings` (CM-408). */
export function projectDrawingsPath(projectId: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(projectId)}/drawings`;
}

/** Under the Project keys; one invalidation refreshes albums and drawings. */
export function projectDrawingsKey(projectId: string) {
  return [...PROJECTS_KEY, "drawings", projectId] as const;
}

/** The Project's albums by name, with drawing counts. */
export function drawingAlbumsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...projectDrawingsKey(projectId), "albums"],
    queryFn: () =>
      apiJson<DrawingAlbumList>(`${projectDrawingsPath(projectId)}/albums`),
  });
}

/** An album and its drawings, each with its latest revision. */
export function drawingAlbumQuery(projectId: string, albumId: string) {
  return queryOptions({
    queryKey: [...projectDrawingsKey(projectId), "album", albumId],
    queryFn: () =>
      apiJson<DrawingAlbumDetail>(
        `${projectDrawingsPath(projectId)}/albums/${encodeURIComponent(albumId)}`,
      ),
  });
}

/** A drawing with its revision history, newest first. */
export function drawingQuery(projectId: string, drawingId: string) {
  return queryOptions({
    queryKey: [...projectDrawingsKey(projectId), "drawing", drawingId],
    queryFn: () =>
      apiJson<DrawingDetail>(
        `${projectDrawingsPath(projectId)}/${encodeURIComponent(drawingId)}`,
      ),
  });
}

/**
 * Uploads a new drawing (R1 in `albumId`) or, with `drawingId`, a new
 * revision, through `directUpload` (CM-407): PDF, image, DWG or DXF up to
 * 100 MB, in parts above 8 MB, with an image's thumbnail.
 */
export async function uploadDrawingFile(
  projectId: string,
  file: File,
  target: { albumId: string; name?: string } | { drawingId: string },
  options: UploadOptions = {},
): Promise<DrawingDetail> {
  const problem = checkUploadFile("drawing", file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = projectDrawingsPath(projectId);
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      "drawingId" in target
        ? postJson<DrawingDetail>(
            `${base}/${encodeURIComponent(target.drawingId)}/revisions`,
            { key: started.key, fileName: started.fileName },
            signal,
          )
        : postJson<DrawingDetail>(
            base,
            {
              key: started.key,
              fileName: started.fileName,
              albumId: target.albumId,
              ...(target.name == null ? {} : { name: target.name }),
            },
            signal,
          ),
  });
}

function useRefresh(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: projectDrawingsKey(projectId) });
}

export function useAddDrawingAlbum(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (name: string) =>
      postJson<DrawingAlbum>(`${projectDrawingsPath(projectId)}/albums`, {
        name,
      }),
    onSuccess: refresh,
  });
}

export function useRenameDrawingAlbum(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (input: { albumId: string; name: string; updatedAt: string }) =>
      postJson<DrawingAlbum>(
        `${projectDrawingsPath(projectId)}/albums/${encodeURIComponent(input.albumId)}/update`,
        { name: input.name, updatedAt: input.updatedAt },
      ),
    onSuccess: refresh,
  });
}

export function useDeleteDrawingAlbum(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (albumId: string) =>
      postJson<undefined>(
        `${projectDrawingsPath(projectId)}/albums/${encodeURIComponent(albumId)}/delete`,
        {},
      ),
    onSuccess: refresh,
  });
}

export function useRenameDrawing(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (input: {
      drawingId: string;
      name: string;
      updatedAt: string;
    }) =>
      postJson<DrawingDetail>(
        `${projectDrawingsPath(projectId)}/${encodeURIComponent(input.drawingId)}/update`,
        { name: input.name, updatedAt: input.updatedAt },
      ),
    onSuccess: refresh,
  });
}

export function useMoveDrawing(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (input: {
      drawingId: string;
      albumId: string;
      updatedAt: string;
    }) =>
      postJson<DrawingDetail>(
        `${projectDrawingsPath(projectId)}/${encodeURIComponent(input.drawingId)}/move`,
        { albumId: input.albumId, updatedAt: input.updatedAt },
      ),
    onSuccess: refresh,
  });
}

export function useDeleteDrawing(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (drawingId: string) =>
      postJson<undefined>(
        `${projectDrawingsPath(projectId)}/${encodeURIComponent(drawingId)}/delete`,
        {},
      ),
    onSuccess: refresh,
  });
}

/** One upload per `mutateAsync` call; refreshes albums and drawings after. */
export function useUploadDrawingFile(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (
      input: {
        file: File;
        target: { albumId: string; name?: string } | { drawingId: string };
      } & UploadOptions,
    ) => {
      const { file, target, ...options } = input;
      return uploadDrawingFile(projectId, file, target, options);
    },
    onSuccess: refresh,
  });
}
