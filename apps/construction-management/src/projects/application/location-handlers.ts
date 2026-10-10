import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  Location,
  locationNotFound,
  type LocationDetailsInput,
} from "../domain/location";
import type { ProjectRepository } from "../domain/project-repository";
import type {
  LocationRepository,
  StructureUsage,
} from "../domain/structure-repository";
import type { ProjectViewer } from "./project-handlers";
import { assertProjectVisible } from "./project-visibility";
import type {
  LocationView,
  ProjectStructureReader,
} from "./structure-read-model";

function view(location: Location): LocationView {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    position: location.position,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  };
}

function locationChanged() {
  return conflict(
    "LOCATION_CHANGED",
    "Someone else changed this Location after you opened it. Reload to see their changes.",
  );
}

/**
 * Locations of a non-building Project (CM-405). Routes check the
 * Permission Matrix (`projects.locations`) first; these apply project
 * visibility and ask `StructureUsage` before a delete.
 */
export class LocationHandlers {
  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly locations: LocationRepository,
    private readonly reader: ProjectStructureReader,
    private readonly usage: StructureUsage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private audit(
    location: Location,
    by: string,
    action: string,
    extra: Partial<AuditEvent>,
  ): AuditEvent {
    return {
      workspaceId: location.workspaceId,
      actorUserId: by,
      action,
      entityType: "location",
      entityId: location.id,
      occurredAt: location.updatedAt,
      ...extra,
    };
  }

  private async location(
    viewer: ProjectViewer,
    projectId: string,
    id: string,
  ): Promise<Location> {
    const found = await this.locations.find(viewer.workspaceId, projectId, id);
    if (found == null) throw locationNotFound();
    return found;
  }

  /** In the Team Member's order. */
  async list(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<LocationView[]> {
    await assertProjectVisible(this.projects, viewer, projectId);
    return this.reader.locations(viewer.workspaceId, projectId);
  }

  /** Add Location, at the end of the list; 409 `LOCATION_NAME_IN_USE`. */
  async create(input: {
    viewer: ProjectViewer;
    projectId: string;
    details: LocationDetailsInput;
    by: string;
  }): Promise<LocationView> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const existing = await this.locations.list(viewer.workspaceId, projectId);
    const now = this.clock();
    const location = Location.create({
      id: newId(now.getTime()),
      workspaceId: viewer.workspaceId,
      projectId,
      details: input.details,
      position: Math.max(-1, ...existing.map((item) => item.position)) + 1,
      by: input.by,
      now,
    });
    await this.locations.insert(
      location,
      this.audit(location, input.by, "location.created", {
        after: { projectId, ...location.details },
      }),
    );
    return view(location);
  }

  /** 409 `LOCATION_CHANGED` on a stale `updatedAt`, `LOCATION_NAME_IN_USE`. */
  async update(input: {
    viewer: ProjectViewer;
    projectId: string;
    locationId: string;
    details: LocationDetailsInput;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<LocationView> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const location = await this.location(viewer, projectId, input.locationId);
    if (location.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw locationChanged();
    const before = location.details;
    location.update(input.details, input.by, this.clock());
    await this.locations.update(
      location,
      input.expectedUpdatedAt,
      this.audit(location, input.by, "location.updated", {
        before,
        after: location.details,
      }),
    );
    return view(location);
  }

  /**
   * Up / down: swaps places with the neighbour in that direction; at the
   * top or bottom nothing changes. Returns the list in its new order.
   */
  async move(input: {
    viewer: ProjectViewer;
    projectId: string;
    locationId: string;
    direction: "up" | "down";
    by: string;
  }): Promise<LocationView[]> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const all = await this.locations.list(viewer.workspaceId, projectId);
    const index = all.findIndex((item) => item.id === input.locationId);
    const moved = all[index];
    if (moved == null) throw locationNotFound();
    const other = all[input.direction === "up" ? index - 1 : index + 1];
    if (other != null) {
      const now = this.clock();
      const movedAt = moved.updatedAt;
      const otherAt = other.updatedAt;
      const [from, to] = [moved.position, other.position];
      // Positions may have gaps or ties after deletes; swapping by index
      // order keeps the result strictly ordered.
      const target =
        from === to ? (input.direction === "up" ? to - 1 : to + 1) : to;
      moved.moveTo(target, input.by, now);
      other.moveTo(from, input.by, now);
      await this.locations.swap(
        { location: moved, expectedUpdatedAt: movedAt },
        { location: other, expectedUpdatedAt: otherAt },
        this.audit(moved, input.by, "location.moved", {
          before: { position: from },
          after: { position: target, direction: input.direction },
        }),
      );
    }
    return this.reader.locations(viewer.workspaceId, projectId);
  }

  /** Tombstone; 409 `LOCATION_IN_USE` while a site record points at it. */
  async delete(input: {
    viewer: ProjectViewer;
    projectId: string;
    locationId: string;
    by: string;
  }): Promise<void> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const location = await this.location(viewer, projectId, input.locationId);
    if (await this.usage.isLocationUsed(viewer.workspaceId, location.id))
      throw conflict(
        "LOCATION_IN_USE",
        "Site records point at this Location, so it cannot be deleted.",
      );
    const before = location.details;
    location.delete(input.by, this.clock());
    await this.locations.delete(
      location,
      this.audit(location, input.by, "location.deleted", {
        before: { projectId, ...before },
      }),
    );
  }
}
