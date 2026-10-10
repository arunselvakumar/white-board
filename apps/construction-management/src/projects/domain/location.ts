import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import { tidyName } from "./wing-generator";

export const LOCATION_NAME_MAX = 80;
export const LOCATION_DESCRIPTION_MAX = 300;

export const locationNotFound = () =>
  notFound("LOCATION_NOT_FOUND", "This Location was not found.");

export type LocationDetailsInput = {
  name: string;
  description?: string | null;
};

export type LocationDetails = { name: string; description: string | null };

/**
 * A Location's form: name required (≤ 80, spaces tidied), description
 * optional (≤ 300; blank is none).
 */
export function locationDetails(input: LocationDetailsInput): LocationDetails {
  const name = tidyName(input.name);
  if (name.length === 0)
    throw new DomainError("LOCATION_NAME_REQUIRED", "Enter the Location name.");
  if (name.length > LOCATION_NAME_MAX)
    throw new DomainError(
      "LOCATION_NAME_TOO_LONG",
      `Location name must be at most ${String(LOCATION_NAME_MAX)} characters.`,
    );
  const description = input.description?.trim() ?? "";
  if (description.length > LOCATION_DESCRIPTION_MAX)
    throw new DomainError(
      "LOCATION_DESCRIPTION_TOO_LONG",
      `Description must be at most ${String(LOCATION_DESCRIPTION_MAX)} characters.`,
    );
  return { name, description: description === "" ? null : description };
}

export type LocationProps = LocationDetails & {
  id: string;
  workspaceId: string;
  projectId: string;
  /** Order on the Locations screen and in pickers. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * A named place on a non-building Project (ADR CM-0013 §4): "Chainage
 * 0+000 – 2+500", "Culvert C3". The name is unique in the Project ignoring
 * case (the store enforces it); the Team Member orders the list.
 */
export class Location {
  private constructor(private props: LocationProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    details: LocationDetailsInput;
    position: number;
    by: string;
    now: Date;
  }): Location {
    return new Location({
      ...locationDetails(input.details),
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      position: input.position,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: LocationProps): Location {
    return new Location(props);
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
  get description(): string | null {
    return this.props.description;
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

  get details(): LocationDetails {
    return { name: this.props.name, description: this.props.description };
  }

  update(details: LocationDetailsInput, by: string, now: Date): void {
    this.props = {
      ...this.props,
      ...locationDetails(details),
      updatedAt: now,
      updatedBy: by,
    };
  }

  /** A new place in the order (up / down swaps with the neighbour). */
  moveTo(position: number, by: string, now: Date): void {
    this.props = { ...this.props, position, updatedAt: now, updatedBy: by };
  }

  delete(by: string, now: Date): void {
    if (this.props.deletedAt != null) throw locationNotFound();
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
