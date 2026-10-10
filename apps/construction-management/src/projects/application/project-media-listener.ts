import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";
import {
  isProjectMediaAttached,
  isProjectMediaRemoved,
} from "@/src/shared-kernel/project-media";

import type { NewMediaItem } from "../domain/media-item";

/** Where the Gallery index is kept (`construction_projects.media_items`). */
export type ProjectMediaStore = {
  /** Indexes a PDF or an image; other types and known keys are left out. */
  attach(item: NewMediaItem): Promise<void>;
  /** Tombstones the record's rows, or the one at `fileKey`. */
  remove(input: {
    workspaceId: string;
    source: string;
    sourceId: string;
    fileKey?: string;
    now: Date;
  }): Promise<void>;
};

/**
 * Keeps the Gallery index in step with files other contexts attach to a
 * Project (ADR CM-0014): `ProjectMediaAttached` adds a row,
 * `ProjectMediaRemoved` tombstones them. Registered at composition
 * (`src/composition/project-media-listeners.ts`); every other event is
 * ignored.
 */
export class ProjectMediaListener implements DomainEventListener {
  constructor(private readonly store: ProjectMediaStore) {}

  async handle(event: DomainEvent): Promise<void> {
    if (isProjectMediaAttached(event)) {
      await this.store.attach({
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        source: event.source,
        sourceId: event.sourceId,
        fileKey: event.fileKey,
        thumbKey: event.thumbKey,
        fileName: event.fileName,
        contentType: event.contentType,
        bytes: event.bytes,
        uploadedBy: event.uploadedBy,
        uploadedAt: event.uploadedAt,
      });
      return;
    }
    if (isProjectMediaRemoved(event))
      await this.store.remove({
        workspaceId: event.workspaceId,
        source: event.source,
        sourceId: event.sourceId,
        ...(event.fileKey == null ? {} : { fileKey: event.fileKey }),
        now: event.occurredAt,
      });
  }
}
