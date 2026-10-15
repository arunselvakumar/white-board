/**
 * Project Progress % on the Project card (ADR CM-0013 §2, CM-0019 §4,
 * CM-805). Progress comes from Tasks, which the projects context does not
 * own: it asks this port, and `src/composition/project-progress.ts`
 * answers from the tracking tables.
 */

/** A Project's progress and the weight its roll-up used. */
export type ProjectProgress = {
  /** 0–100, two decimals. */
  pct: number;
  /** Total Price when every leaf task has one, else planned duration. */
  weighting: "price" | "duration";
};

export type ProjectProgressReader = {
  /**
   * Progress of each Project that has live tasks; a Project without tasks
   * is absent (the card shows no bar).
   */
  progressOf(
    workspaceId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectProgress>>;
};
