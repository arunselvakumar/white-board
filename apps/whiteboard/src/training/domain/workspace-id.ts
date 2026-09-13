import { DomainError } from "./errors";

export class WorkspaceId {
  private constructor(readonly value: string) {}

  static create(raw: string): WorkspaceId {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError(
        "WORKSPACE_ID_REQUIRED",
        "Workspace id is required.",
      );
    }
    return new WorkspaceId(value);
  }

  equals(other: WorkspaceId): boolean {
    return this.value === other.value;
  }
}
