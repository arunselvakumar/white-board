import type { AuditEvent } from "@/src/shared-kernel/audit";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { FIRST_PHASE_NAME, Phase, phaseNotFound } from "../domain/phase";
import type { ProjectRepository } from "../domain/project-repository";
import type {
  PhaseRepository,
  StructureUsage,
  WingRepository,
} from "../domain/structure-repository";
import { Wing, wingNotFound } from "../domain/wing";
import type { WingFloorInput } from "../domain/wing-floors";
import type { WingConfigInput } from "../domain/wing-generator";
import type { ProjectViewer } from "./project-handlers";
import { assertProjectVisible } from "./project-visibility";
import type {
  PhaseView,
  ProjectStructureReader,
  WingDetail,
  WingsOverview,
} from "./structure-read-model";

function phaseView(phase: Phase, wings: number): PhaseView {
  return {
    id: phase.id,
    name: phase.name,
    position: phase.position,
    wings,
    createdAt: phase.createdAt,
    updatedAt: phase.updatedAt,
  };
}

function wingDetail(wing: Wing): WingDetail {
  return {
    id: wing.id,
    phaseId: wing.phaseId,
    type: wing.type,
    name: wing.name,
    config: wing.config,
    position: wing.position,
    floors: wing.floors.map((floor) => ({
      ...floor,
      units: floor.units.map((unit) => ({ ...unit })),
    })),
    totals: wing.totals,
    createdAt: wing.createdAt,
    updatedAt: wing.updatedAt,
  };
}

/** The audit row's picture of a Wing; the unit list is too long to keep. */
function wingSnapshot(wing: Wing) {
  return {
    phaseId: wing.phaseId,
    type: wing.type,
    name: wing.name,
    config: wing.config,
    ...wing.totals,
  };
}

function wingChanged(): DomainError {
  return conflict(
    "WING_CHANGED",
    "Someone else changed this Wing after you opened it. Reload to see their changes.",
  );
}

function phaseChanged(): DomainError {
  return conflict(
    "PHASE_CHANGED",
    "Someone else changed this Phase after you opened it. Reload to see their changes.",
  );
}

function phaseInvalid(): DomainError {
  return new DomainError(
    "WING_PHASE_INVALID",
    "Choose a Phase of this Project.",
    { details: { field: "phaseId" } },
  );
}

function unitNamesById(wing: Wing): Map<string, string> {
  return new Map(
    wing.floors.flatMap((floor) =>
      floor.units.map((unit) => [unit.id, unit.name] as const),
    ),
  );
}

/**
 * Phases and Wings of a Project (CM-402). Routes check the Permission
 * Matrix (`projects.wings`) first; these apply project visibility (a
 * Member not on the Project gets 404) and ask `StructureUsage` before
 * removing a floor, unit or Wing that site records may point at.
 */
export class WingHandlers {
  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly phases: PhaseRepository,
    private readonly wings: WingRepository,
    private readonly reader: ProjectStructureReader,
    private readonly usage: StructureUsage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private audit(
    viewer: ProjectViewer,
    by: string,
    action: string,
    entity: { type: string; id: string },
    extra: Partial<AuditEvent>,
  ): AuditEvent {
    return {
      workspaceId: viewer.workspaceId,
      actorUserId: by,
      action,
      entityType: entity.type,
      entityId: entity.id,
      ...extra,
    };
  }

  private async phase(
    viewer: ProjectViewer,
    projectId: string,
    phaseId: string,
  ): Promise<Phase> {
    const found = await this.phases.find(
      viewer.workspaceId,
      projectId,
      phaseId,
    );
    if (found == null) throw phaseNotFound();
    return found;
  }

  private async wing(
    viewer: ProjectViewer,
    projectId: string,
    wingId: string,
  ): Promise<Wing> {
    const found = await this.wings.find(viewer.workspaceId, projectId, wingId);
    if (found == null) throw wingNotFound();
    return found;
  }

  /** The Wings screen: every Phase (empty ones too) with its Wings and totals. */
  async overview(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<WingsOverview> {
    await assertProjectVisible(this.projects, viewer, projectId);
    const [phases, wings] = await Promise.all([
      this.reader.phases(viewer.workspaceId, projectId),
      this.reader.wingSummaries(viewer.workspaceId, projectId),
    ]);
    const grouped = phases.map((phase) => {
      const items = wings.filter((wing) => wing.phaseId === phase.id);
      return {
        ...phase,
        items,
        floors: items.reduce((sum, wing) => sum + wing.floors, 0),
        units: items.reduce((sum, wing) => sum + wing.units, 0),
      };
    });
    return {
      phases: grouped,
      totals: {
        wings: wings.length,
        floors: grouped.reduce((sum, phase) => sum + phase.floors, 0),
        units: grouped.reduce((sum, phase) => sum + phase.units, 0),
      },
    };
  }

  async listPhases(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<PhaseView[]> {
    await assertProjectVisible(this.projects, viewer, projectId);
    return this.reader.phases(viewer.workspaceId, projectId);
  }

  /** Add Phase, after the last one; 409 `PHASE_NAME_IN_USE`. */
  async createPhase(input: {
    viewer: ProjectViewer;
    projectId: string;
    name: string;
    by: string;
  }): Promise<PhaseView> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const existing = await this.phases.list(viewer.workspaceId, projectId);
    const now = this.clock();
    const phase = Phase.create({
      id: newId(now.getTime()),
      workspaceId: viewer.workspaceId,
      projectId,
      name: input.name,
      position: Math.max(-1, ...existing.map((item) => item.position)) + 1,
      by: input.by,
      now,
    });
    await this.phases.insert(
      phase,
      this.audit(
        viewer,
        input.by,
        "phase.created",
        { type: "phase", id: phase.id },
        {
          after: { projectId, name: phase.name },
          occurredAt: now,
        },
      ),
    );
    return phaseView(phase, 0);
  }

  /** 409 `PHASE_CHANGED` on a stale `updatedAt`, `PHASE_NAME_IN_USE`. */
  async renamePhase(input: {
    viewer: ProjectViewer;
    projectId: string;
    phaseId: string;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<PhaseView> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const phase = await this.phase(viewer, projectId, input.phaseId);
    if (phase.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw phaseChanged();
    const before = { name: phase.name };
    phase.rename(input.name, input.by, this.clock());
    await this.phases.update(
      phase,
      input.expectedUpdatedAt,
      this.audit(
        viewer,
        input.by,
        "phase.renamed",
        { type: "phase", id: phase.id },
        {
          before,
          after: { name: phase.name },
          occurredAt: phase.updatedAt,
        },
      ),
    );
    const counts = await this.reader.phases(viewer.workspaceId, projectId);
    return phaseView(
      phase,
      counts.find((item) => item.id === phase.id)?.wings ?? 0,
    );
  }

  /** Tombstone; 409 `PHASE_NOT_EMPTY` while it holds Wings. */
  async deletePhase(input: {
    viewer: ProjectViewer;
    projectId: string;
    phaseId: string;
    by: string;
  }): Promise<void> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const phase = await this.phase(viewer, projectId, input.phaseId);
    phase.delete(input.by, this.clock());
    await this.phases.delete(
      phase,
      this.audit(
        viewer,
        input.by,
        "phase.deleted",
        { type: "phase", id: phase.id },
        {
          before: { projectId, name: phase.name },
          occurredAt: phase.updatedAt,
        },
      ),
    );
  }

  async get(
    viewer: ProjectViewer,
    projectId: string,
    wingId: string,
  ): Promise<WingDetail> {
    await assertProjectVisible(this.projects, viewer, projectId);
    return wingDetail(await this.wing(viewer, projectId, wingId));
  }

  /**
   * Save on Add Wing: configuration plus the edited floors and units in one
   * request. Without `phaseId` the Wing goes into the first Phase, and a
   * Project with no Phase gets "Phase 1" with it.
   */
  async create(input: {
    viewer: ProjectViewer;
    projectId: string;
    phaseId?: string | null;
    type: string;
    name: string;
    config: WingConfigInput;
    floors: readonly WingFloorInput[];
    by: string;
  }): Promise<WingDetail> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const now = this.clock();
    const phases = await this.phases.list(viewer.workspaceId, projectId);
    let phase: Phase | undefined;
    let firstPhase: Phase | undefined;
    if (input.phaseId != null) {
      phase = phases.find((item) => item.id === input.phaseId);
      if (phase == null) throw phaseInvalid();
    } else if (phases.length > 0) {
      phase = phases[0];
    } else {
      firstPhase = Phase.create({
        id: newId(now.getTime()),
        workspaceId: viewer.workspaceId,
        projectId,
        name: FIRST_PHASE_NAME,
        position: 0,
        by: input.by,
        now,
      });
      phase = firstPhase;
    }
    if (phase == null) throw phaseInvalid();

    const wing = Wing.create({
      id: newId(now.getTime()),
      workspaceId: viewer.workspaceId,
      projectId,
      phaseId: phase.id,
      position:
        firstPhase == null
          ? await this.wings.nextPosition(viewer.workspaceId, phase.id)
          : 0,
      type: input.type,
      name: input.name,
      config: input.config,
      floors: input.floors,
      by: input.by,
      now,
      newId: () => newId(now.getTime()),
    });
    await this.wings.insert(
      wing,
      this.audit(
        viewer,
        input.by,
        "wing.created",
        { type: "wing", id: wing.id },
        {
          after: { projectId, ...wingSnapshot(wing) },
          occurredAt: now,
        },
      ),
      firstPhase == null
        ? undefined
        : {
            phase: firstPhase,
            audit: this.audit(
              viewer,
              input.by,
              "phase.created",
              { type: "phase", id: firstPhase.id },
              {
                after: { projectId, name: firstPhase.name },
                occurredAt: now,
              },
            ),
          },
    );
    return wingDetail(wing);
  }

  /**
   * Save on Edit Wing: name, Phase and the whole floor list; rows keep their
   * ids. 409 `WING_CHANGED` on a stale `updatedAt`; 409 `UNIT_IN_USE` /
   * `FLOOR_IN_USE` when a removed row is used by a site record.
   */
  async update(input: {
    viewer: ProjectViewer;
    projectId: string;
    wingId: string;
    phaseId?: string | null;
    name: string;
    floors: readonly WingFloorInput[];
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<WingDetail> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const wing = await this.wing(viewer, projectId, input.wingId);
    if (wing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw wingChanged();

    let phaseId = wing.phaseId;
    let position = wing.position;
    if (input.phaseId != null && input.phaseId !== wing.phaseId) {
      const phase = await this.phases.find(
        viewer.workspaceId,
        projectId,
        input.phaseId,
      );
      if (phase == null) throw phaseInvalid();
      phaseId = phase.id;
      position = await this.wings.nextPosition(viewer.workspaceId, phase.id);
    }

    const before = wingSnapshot(wing);
    const storedNames = unitNamesById(wing);
    const now = this.clock();
    const removals = wing.update({
      name: input.name,
      phaseId,
      position,
      floors: input.floors,
      by: input.by,
      now,
      newId: () => newId(now.getTime()),
    });
    if (removals.floorIds.length > 0 || removals.unitIds.length > 0) {
      const used = await this.usage.usedFloorsAndUnits(
        viewer.workspaceId,
        removals,
      );
      if (used.unitIds.length > 0) {
        const names = used.unitIds.map((id) => storedNames.get(id) ?? id);
        throw conflict(
          "UNIT_IN_USE",
          `Site records point at ${names.join(", ")}, so ${names.length === 1 ? "it" : "they"} cannot be removed.`,
          { unitIds: used.unitIds, names },
        );
      }
      if (used.floorIds.length > 0)
        throw conflict(
          "FLOOR_IN_USE",
          "Site records point at a floor you removed, so it cannot be removed.",
          { floorIds: used.floorIds },
        );
    }
    await this.wings.update(
      wing,
      input.expectedUpdatedAt,
      removals,
      this.audit(
        viewer,
        input.by,
        "wing.updated",
        { type: "wing", id: wing.id },
        {
          before,
          after: {
            ...wingSnapshot(wing),
            removedFloors: removals.floorIds.length,
            removedUnits: removals.unitIds.length,
          },
          occurredAt: now,
        },
      ),
    );
    return wingDetail(wing);
  }

  /** Tombstones the Wing, its floors and units; 409 `WING_IN_USE`. */
  async delete(input: {
    viewer: ProjectViewer;
    projectId: string;
    wingId: string;
    by: string;
  }): Promise<void> {
    const { viewer, projectId } = input;
    await assertProjectVisible(this.projects, viewer, projectId);
    const wing = await this.wing(viewer, projectId, input.wingId);
    if (await this.usage.isWingUsed(viewer.workspaceId, wing.id))
      throw conflict(
        "WING_IN_USE",
        "Site records point at this Wing, its floors or units, so it cannot be deleted.",
      );
    const before = wingSnapshot(wing);
    wing.delete(input.by, this.clock());
    await this.wings.delete(
      wing,
      this.audit(
        viewer,
        input.by,
        "wing.deleted",
        { type: "wing", id: wing.id },
        {
          before: { projectId, ...before },
          occurredAt: wing.updatedAt,
        },
      ),
    );
  }
}
