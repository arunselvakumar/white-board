/** A Programme, defined once for the Workspace. */
export type ProgrammeView = {
  id: string;
  name: string;
  /** Completed months on the first day of the Academic Year. Null is no limit. */
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isDaycare: boolean;
  sortOrder: number;
  isArchived: boolean;
};

export type ProgrammeListView = { items: ProgrammeView[] };
