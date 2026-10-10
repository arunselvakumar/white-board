import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import { tidyName } from "./wing-generator";

export const PHASE_NAME_MAX = 60;

/** The Phase a Project's first Wing goes into when it has none. */
export const FIRST_PHASE_NAME = "Phase 1";

export const phaseNotFound = () =>
  notFound("PHASE_NOT_FOUND", "This Phase was not found.");

/** Phase name: required, at most 60 characters, spaces tidied. */
export function phaseName(raw: string): string {
  const name = tidyName(raw);
  if (name.length === 0)
    throw new DomainError("PHASE_NAME_REQUIRED", "Enter the Phase name.");
  if (name.length > PHASE_NAME_MAX)
    throw new DomainError(
      "PHASE_NAME_TOO_LONG",
      `Phase name must be at most ${String(PHASE_NAME_MAX)} characters.`,
    );
  return name;
}

/** "Phase 2" after "Phase 1": the name Add Phase suggests. */
export function nextPhaseName(existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  let number = existing.length + 1;
  while (taken.has(`phase ${String(number)}`)) number += 1;
  return `Phase ${String(number)}`;
}

export type PhaseProps = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  /** Order on the Wings screen. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * "Phase 1", "Phase 2" … of a Project with Wings (ADR CM-0013 §3): named,
 * ordered, the name unique in the Project ignoring case (the store
 * enforces it). A Phase with live Wings cannot be deleted.
 */
export class Phase {
  private constructor(private props: PhaseProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    name: string;
    position: number;
    by: string;
    now: Date;
  }): Phase {
    return new Phase({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      name: phaseName(input.name),
      position: input.position,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: PhaseProps): Phase {
    return new Phase(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get projectId(): string {
    return this.props.projectId;
  }
  get name(): string {
    return this.props.name;
  }
  get position(): number {
    return this.props.position;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  rename(name: string, by: string, now: Date): void {
    this.props = {
      ...this.props,
      name: phaseName(name),
      updatedAt: now,
      updatedBy: by,
    };
  }

  delete(by: string, now: Date): void {
    if (this.props.deletedAt != null) throw phaseNotFound();
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
