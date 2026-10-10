import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionProjectsGalleryItemResponseModel,
  ListConstructionProjectsGalleryResponseModel,
  ListConstructionProjectsGalleryUploadersResponseModel,
} from "@/app/api/construction/projects/projects/[id]/gallery/gallery-models";

import { apiJson } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type GalleryItem = ConstructionProjectsGalleryItemResponseModel;
export type GalleryPage = ListConstructionProjectsGalleryResponseModel;
export type GalleryUploader =
  ListConstructionProjectsGalleryUploadersResponseModel["items"][number];

/** `/api/construction/projects/projects/{id}/gallery` (CM-410). */
export function projectGalleryPath(projectId: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(projectId)}/gallery`;
}

/** Under the Project keys, so uploads elsewhere on the Project refresh it. */
export function projectGalleryKey(projectId: string) {
  return [...PROJECTS_KEY, "gallery", projectId] as const;
}

export type GalleryFilter = {
  type: "all" | "image" | "pdf";
  /** `all` or a source: document, drawing, testing_report. */
  source: string;
  /** `all` or a User id. */
  uploadedBy: string;
  from: string | null;
  to: string | null;
  search: string;
  cursor: { after: string } | { before: string } | null;
};

export const EMPTY_GALLERY_FILTER: GalleryFilter = {
  type: "all",
  source: "all",
  uploadedBy: "all",
  from: null,
  to: null,
  search: "",
  cursor: null,
};

/** A page of the Gallery, newest first. */
export function galleryQuery(projectId: string, filter: GalleryFilter) {
  const params = new URLSearchParams({ limit: "48" });
  if (filter.type !== "all") params.set("type", filter.type);
  if (filter.source !== "all") params.set("source", filter.source);
  if (filter.uploadedBy !== "all") params.set("uploadedBy", filter.uploadedBy);
  if (filter.from != null) params.set("from", filter.from);
  if (filter.to != null) params.set("to", filter.to);
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...projectGalleryKey(projectId), "list", params.toString()],
    queryFn: () =>
      apiJson<GalleryPage>(
        `${projectGalleryPath(projectId)}?${params.toString()}`,
      ),
  });
}

/** Who uploaded the files the viewer can see, for the Uploaded by filter. */
export function galleryUploadersQuery(projectId: string) {
  return queryOptions({
    queryKey: [...projectGalleryKey(projectId), "uploaders"],
    queryFn: () =>
      apiJson<ListConstructionProjectsGalleryUploadersResponseModel>(
        `${projectGalleryPath(projectId)}/uploaders`,
      ),
  });
}
