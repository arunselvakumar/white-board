import type { AcademicYearSpan } from "../domain/academic-year";
import type { AcademicYearView } from "./academic-year-views";

export type AcademicYearStore = {
  /** Newest first. */
  list(workspaceId: string): Promise<AcademicYearView[]>;
  /** The Workspace's Academic Year start month (1–12). */
  startMonth(workspaceId: string): Promise<number>;
  /** Null when the year already exists. */
  create(
    workspaceId: string,
    span: AcademicYearSpan,
  ): Promise<AcademicYearView | null>;
  /** Makes this year the only current one; null when it is not in the Workspace. */
  makeCurrent(
    workspaceId: string,
    id: string,
  ): Promise<AcademicYearView | null>;
};
