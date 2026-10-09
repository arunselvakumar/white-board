import { normalizeMobile } from "@repo/auth/construction/mobile";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { cleanMasterName, masterNotFound } from "./master-kind";

export type SupervisorDetails = {
  name: string;
  /** E.164. */
  mobile: string | null;
  /** The Team Member this Supervisor is, if any (organization context id). */
  teamMemberId: string | null;
};

export type SupervisorProps = SupervisorDetails & {
  id: string;
  workspaceId: string;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type SupervisorSnapshot = SupervisorDetails & { disabled: boolean };

function cleanDetails(input: {
  name: string;
  mobile?: string | null;
  teamMemberId?: string | null;
}): SupervisorDetails {
  const rawMobile = input.mobile?.trim() ?? "";
  let mobile: string | null = null;
  if (rawMobile !== "") {
    mobile = normalizeMobile(rawMobile);
    if (mobile == null)
      throw new DomainError("MOBILE_INVALID", "Enter a valid mobile number.");
  }
  const teamMemberId = input.teamMemberId?.trim() ?? "";
  return {
    name: cleanMasterName("supervisor", input.name),
    mobile,
    teamMemberId: teamMemberId === "" ? null : teamMemberId,
  };
}

/**
 * The person on site responsible for a group of labourers (`modules/02`,
 * `modules/08`, CM-203). Often a Team Member, but a site may have a
 * Supervisor who never signs in, so the name is the record. A filter on the
 * attendance screen, not a permission.
 */
export class Supervisor {
  private constructor(private props: SupervisorProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    name: string;
    mobile?: string | null;
    teamMemberId?: string | null;
    by: string;
    now: Date;
  }): Supervisor {
    return new Supervisor({
      id: input.id,
      workspaceId: input.workspaceId,
      ...cleanDetails(input),
      disabledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute(props: SupervisorProps): Supervisor {
    return new Supervisor(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get name(): string {
    return this.props.name;
  }
  get mobile(): string | null {
    return this.props.mobile;
  }
  get teamMemberId(): string | null {
    return this.props.teamMemberId;
  }
  get disabled(): boolean {
    return this.props.disabledAt != null;
  }
  get disabledAt(): Date | null {
    return this.props.disabledAt;
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
  get deletedBy(): string | null {
    return this.props.deletedBy;
  }

  snapshot(): SupervisorSnapshot {
    return {
      name: this.props.name,
      mobile: this.props.mobile,
      teamMemberId: this.props.teamMemberId,
      disabled: this.disabled,
    };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw masterNotFound("supervisor");
  }

  /** Replaces name, mobile and Team Member together. */
  update(
    input: {
      name: string;
      mobile?: string | null;
      teamMemberId?: string | null;
    },
    by: string,
    now: Date,
  ): void {
    this.assertLive();
    this.props = {
      ...this.props,
      ...cleanDetails(input),
      updatedAt: now,
      updatedBy: by,
    };
  }

  disable(by: string, now: Date): boolean {
    this.assertLive();
    if (this.props.disabledAt != null) return false;
    this.props = {
      ...this.props,
      disabledAt: now,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  enable(by: string, now: Date): boolean {
    this.assertLive();
    if (this.props.disabledAt == null) return false;
    this.props = {
      ...this.props,
      disabledAt: null,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
