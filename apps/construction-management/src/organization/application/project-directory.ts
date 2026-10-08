import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * The Company's live Projects, by id (CM-204). The organization context
 * refers to Projects by id only; infrastructure reads them without
 * importing the projects context.
 */
export type ProjectDirectory = {
  /** The ids in `ids` that are not live Projects of the Company. */
  unknownIds(workspaceId: string, ids: readonly string[]): Promise<string[]>;
};

/** 400 `PROJECT_NOT_FOUND` unless every id is a live Project of the Company. */
export async function assertKnownProjects(
  directory: ProjectDirectory,
  workspaceId: string,
  ids: readonly string[] | undefined,
): Promise<void> {
  if (ids == null || ids.length === 0) return;
  const unknown = await directory.unknownIds(workspaceId, ids);
  if (unknown.length > 0)
    throw new DomainError(
      "PROJECT_NOT_FOUND",
      "Choose Projects from the list. One of them was not found.",
      { details: { projectIds: unknown } },
    );
}
