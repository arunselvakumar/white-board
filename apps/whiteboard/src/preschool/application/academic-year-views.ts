/** One Academic Year. Dates are YYYY-MM-DD. */
export type AcademicYearView = {
  id: string;
  /** "2026–27" */
  name: string;
  startsOn: string;
  endsOn: string;
  /** Exactly one Academic Year of a Workspace is current. */
  isCurrent: boolean;
};

export type AcademicYearListView = { items: AcademicYearView[] };
