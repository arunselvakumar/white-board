/**
 * What the labour context needs to know about records other contexts own
 * (`modules/08`, "Decisions for the build"). Ids only; implemented in
 * infrastructure with plain reads, so no context imports another.
 */
export type ProjectDirectory = {
  /** The live Projects among `ids`, with their names. */
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string }>>;
};

export type LabourCategoryDirectory = {
  /** Live categories among `ids`; `disabled` ones exist but leave pickers. */
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string; disabled: boolean }>>;
};

/**
 * Site Engineers (`supervisors` in code, ADR CM-0036). A Labour has none of
 * their own since ADR CM-0041: `find` names the one an old attendance day was
 * saved with, and `onProjects` gives the Site Engineers a Labour answers to.
 */
export type SupervisorDirectory = {
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string; disabled: boolean }>>;
  /**
   * The Site Engineers on each of `projectIds`, by name (ADR CM-0041):
   * enabled ones whose sign-in is on the Project. Projects with none are
   * left out.
   */
  onProjects(
    workspaceId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, { id: string; name: string }[]>>;
};

export type TeamMemberDirectory = {
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string }>>;
};
