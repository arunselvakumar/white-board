import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  masterChanged,
  masterInUse,
  masterNotFound,
} from "../domain/master-kind";
import { Supervisor } from "../domain/supervisor";
import type {
  MasterUsage,
  SupervisorStore,
  TeamMemberDirectory,
} from "./ports";
import type { LookupStatusFilter } from "./lookup-handlers";

export type SupervisorReadModel = {
  id: string;
  name: string;
  mobile: string | null;
  teamMemberId: string | null;
  /** The Team Member's name now; null without one or once they left. */
  teamMemberName: string | null;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SupervisorInput = {
  name: string;
  mobile?: string | null;
  teamMemberId?: string | null;
};

function toReadModel(
  supervisor: Supervisor,
  names: Map<string, string>,
): SupervisorReadModel {
  return {
    id: supervisor.id,
    name: supervisor.name,
    mobile: supervisor.mobile,
    teamMemberId: supervisor.teamMemberId,
    teamMemberName:
      supervisor.teamMemberId == null
        ? null
        : (names.get(supervisor.teamMemberId) ?? null),
    disabled: supervisor.disabled,
    createdAt: supervisor.createdAt,
    updatedAt: supervisor.updatedAt,
  };
}

/** Supervisors (CM-203). Access is checked by the caller. */
export class SupervisorHandlers {
  constructor(
    private readonly store: SupervisorStore,
    private readonly teamMembers: TeamMemberDirectory,
    private readonly clock: () => Date = () => new Date(),
    /** Without it, delete does not look for references (unit tests). */
    private readonly usage?: MasterUsage,
  ) {}

  private async load(workspaceId: string, id: string): Promise<Supervisor> {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw masterNotFound("supervisor");
    return found;
  }

  private async names(
    workspaceId: string,
    supervisors: readonly Supervisor[],
  ): Promise<Map<string, string>> {
    const ids = supervisors
      .map((item) => item.teamMemberId)
      .filter((id): id is string => id != null);
    if (ids.length === 0) return new Map();
    return this.teamMembers.namesOf(workspaceId, [...new Set(ids)]);
  }

  private async readModel(
    supervisor: Supervisor,
  ): Promise<SupervisorReadModel> {
    return toReadModel(
      supervisor,
      await this.names(supervisor.workspaceId, [supervisor]),
    );
  }

  /** A chosen Team Member must be a live Team Member of this Company. */
  private async assertTeamMember(
    workspaceId: string,
    teamMemberId: string | null,
  ): Promise<void> {
    if (teamMemberId == null) return;
    const names = await this.teamMembers.namesOf(workspaceId, [teamMemberId]);
    if (!names.has(teamMemberId))
      throw new DomainError(
        "SUPERVISOR_TEAM_MEMBER_NOT_FOUND",
        "Choose a Team Member of this Company.",
      );
  }

  async list(
    workspaceId: string,
    status: LookupStatusFilter = "all",
  ): Promise<SupervisorReadModel[]> {
    const supervisors = (await this.store.list(workspaceId)).filter(
      (item) => status === "all" || item.disabled === (status === "disabled"),
    );
    const names = await this.names(workspaceId, supervisors);
    return supervisors.map((item) => toReadModel(item, names));
  }

  async get(workspaceId: string, id: string): Promise<SupervisorReadModel> {
    return this.readModel(await this.load(workspaceId, id));
  }

  async create(
    input: SupervisorInput & { workspaceId: string; by: string },
  ): Promise<SupervisorReadModel> {
    const now = this.clock();
    const supervisor = Supervisor.create({
      ...input,
      id: newId(now.getTime()),
      now,
    });
    await this.assertTeamMember(input.workspaceId, supervisor.teamMemberId);
    await this.store.insert(supervisor, {
      action: "supervisor.created",
      before: null,
      by: input.by,
      now,
    });
    return this.readModel(supervisor);
  }

  /** Replaces name, mobile and Team Member; 409 `SUPERVISOR_CHANGED` when stale. */
  async update(
    input: SupervisorInput & {
      workspaceId: string;
      id: string;
      expectedUpdatedAt: Date;
      by: string;
    },
  ): Promise<SupervisorReadModel> {
    const supervisor = await this.load(input.workspaceId, input.id);
    if (supervisor.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw masterChanged("supervisor");
    const before = supervisor.snapshot();
    const now = this.clock();
    supervisor.update(input, input.by, now);
    if (supervisor.teamMemberId !== before.teamMemberId)
      await this.assertTeamMember(input.workspaceId, supervisor.teamMemberId);
    await this.store.update(supervisor, input.expectedUpdatedAt, {
      action: "supervisor.updated",
      before,
      by: input.by,
      now,
    });
    return this.readModel(supervisor);
  }

  async disable(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<SupervisorReadModel> {
    return this.toggle(input, "disable");
  }

  async enable(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<SupervisorReadModel> {
    return this.toggle(input, "enable");
  }

  private async toggle(
    input: { workspaceId: string; id: string; by: string },
    to: "disable" | "enable",
  ): Promise<SupervisorReadModel> {
    const supervisor = await this.load(input.workspaceId, input.id);
    const loadedAt = supervisor.updatedAt;
    const before = supervisor.snapshot();
    const now = this.clock();
    const changed =
      to === "disable"
        ? supervisor.disable(input.by, now)
        : supervisor.enable(input.by, now);
    if (changed)
      await this.store.update(supervisor, loadedAt, {
        action: `supervisor.${to}d`,
        before,
        by: input.by,
        now,
      });
    return this.readModel(supervisor);
  }

  /** Tombstones; 409 `SUPERVISOR_IN_USE` while labourers or attendance name them. */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const supervisor = await this.load(input.workspaceId, input.id);
    const loadedAt = supervisor.updatedAt;
    const before = supervisor.snapshot();
    const now = this.clock();
    supervisor.delete(input.by, now);
    if (
      this.usage != null &&
      (await this.usage("supervisor", input.workspaceId, input.id))
    )
      throw masterInUse("supervisor");
    await this.store.update(supervisor, loadedAt, {
      action: "supervisor.deleted",
      before,
      by: input.by,
      now,
    });
  }
}
