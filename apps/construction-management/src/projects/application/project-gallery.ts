import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { MediaItem, MediaType } from "../domain/media-item";
import type { ProjectRepository } from "../domain/project-repository";
import type { UploaderNames } from "./project-documents";
import type { ProjectViewer } from "./project-handlers";
import { assertProjectVisible } from "./project-visibility";

/** The Gallery's filters (ADR CM-0013 §10). */
export type GalleryFilter = {
  type?: MediaType;
  /** One source; any string, so later sources need no change here. */
  source?: string;
  /** A User id. */
  uploadedBy?: string;
  /** Upload day in the Company time zone, inclusive. */
  from?: CalendarDate;
  to?: CalendarDate;
  /** Part of the file name, ignoring case. */
  q?: string;
};

/** A Gallery row and what its source's file route needs. */
export type GalleryRow = MediaItem & {
  /** For a drawing: the revision the file is (its file route is per revision). */
  revisionId: string | null;
};

export type GalleryItemView = GalleryRow & { uploadedByName: string | null };

/** Reads `construction_projects.media_items`. */
export type GalleryReader = {
  /**
   * Live rows of the Project from `sources` only, newest upload first, then
   * newest id; `after` pages towards older files, `before` back.
   */
  list(input: {
    workspaceId: string;
    projectId: string;
    sources: readonly string[];
    filter: GalleryFilter;
    limit: number;
    after?: ListCursor;
    before?: ListCursor;
  }): Promise<{ items: GalleryRow[]; total: number; hasMore: boolean }>;
  /** Who uploaded the live files of `sources`. */
  uploaderIds(input: {
    workspaceId: string;
    projectId: string;
    sources: readonly string[];
  }): Promise<string[]>;
};

/**
 * The Gallery (CM-410): every image and PDF of a Project, read from the
 * index the owners of files keep (ADR CM-0014). Read only — files are
 * added and removed at their source. Routes check `projects.gallery` read
 * and pass the sources whose menus the viewer may read; this applies
 * Project visibility.
 */
export class ProjectGallery {
  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly reader: GalleryReader,
    private readonly names: UploaderNames,
  ) {}

  async list(input: {
    viewer: ProjectViewer;
    projectId: string;
    sources: readonly string[];
    filter: GalleryFilter;
    limit: number;
    after?: ListCursor;
    before?: ListCursor;
  }): Promise<{ items: GalleryItemView[]; total: number; hasMore: boolean }> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    if (input.sources.length === 0)
      return { items: [], total: 0, hasMore: false };
    const page = await this.reader.list({
      workspaceId: viewer.workspaceId,
      projectId,
      sources: input.sources,
      filter: input.filter,
      limit: input.limit,
      ...(input.after == null ? {} : { after: input.after }),
      ...(input.before == null ? {} : { before: input.before }),
    });
    const names = await this.names.namesOf(viewer.workspaceId, [
      ...new Set(page.items.map((item) => item.uploadedBy)),
    ]);
    return {
      items: page.items.map((item) => ({
        ...item,
        uploadedByName: names.get(item.uploadedBy) ?? null,
      })),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  /** Everyone who uploaded a file the viewer can see, by name. */
  async uploaders(input: {
    viewer: ProjectViewer;
    projectId: string;
    sources: readonly string[];
  }): Promise<{ userId: string; name: string | null }[]> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    if (input.sources.length === 0) return [];
    const ids = await this.reader.uploaderIds({
      workspaceId: viewer.workspaceId,
      projectId,
      sources: input.sources,
    });
    const names = await this.names.namesOf(viewer.workspaceId, ids);
    return ids
      .map((userId) => ({ userId, name: names.get(userId) ?? null }))
      .sort((a, b) =>
        (a.name ?? "￿").localeCompare(b.name ?? "￿", "en", {
          sensitivity: "base",
        }),
      );
  }
}
