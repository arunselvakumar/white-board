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
 * Roles (organization context): an Employee's Role, and through it their
 * Department (ADR CM-0055 §2). Live Roles only.
 */
export type RoleDirectory = {
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    Map<
      string,
      {
        id: string;
        name: string;
        department: { id: string; name: string } | null;
      }
    >
  >;
};

export type TeamMemberDirectory = {
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string }>>;
};
