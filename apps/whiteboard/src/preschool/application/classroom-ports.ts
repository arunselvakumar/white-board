import type { ClassTeacherCandidate } from "../domain/classroom";
import type {
  AcademicYearRefView,
  ClassroomOptionsView,
  ClassroomView,
  RosterChildView,
} from "./classroom-views";

export type ClassroomRecord = {
  id: string;
  centreId: string;
  academicYearId: string;
  programmeId: string;
  name: string;
  capacity: number;
  isArchived: boolean;
};

export type ClassroomStore = {
  currentAcademicYear(workspaceId: string): Promise<AcademicYearRefView>;
  academicYear(
    workspaceId: string,
    id: string,
  ): Promise<AcademicYearRefView | null>;
  programme(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; isArchived: boolean } | null>;
  /**
   * Classrooms of a Centre and year that are not archived, in Programme
   * order; only `classroomIds` when given.
   */
  list(
    workspaceId: string,
    query: {
      centreId: string;
      academicYearId: string;
      classroomIds?: readonly string[];
    },
  ): Promise<ClassroomView[]>;
  find(workspaceId: string, id: string): Promise<ClassroomRecord | null>;
  view(workspaceId: string, id: string): Promise<ClassroomView>;
  /** Children with an active Admission here, by first name. */
  roster(workspaceId: string, classroomId: string): Promise<RosterChildView[]>;
  childCount(workspaceId: string, classroomId: string): Promise<number>;
  /** Another Classroom of the Centre and year that is not archived has this name, ignoring case. */
  nameTaken(
    workspaceId: string,
    query: {
      centreId: string;
      academicYearId: string;
      name: string;
      exceptId?: string;
    },
  ): Promise<boolean>;
  /** Returns the new id. */
  create(
    workspaceId: string,
    record: Omit<ClassroomRecord, "id" | "isArchived">,
  ): Promise<string>;
  update(
    workspaceId: string,
    id: string,
    fields: { name: string; capacity: number },
  ): Promise<void>;
  archive(workspaceId: string, id: string, at: Date): Promise<void>;
  /** Staff that are not deleted, by id. Missing ids are left out. */
  staff(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<ClassTeacherCandidate[]>;
  /** Replaces the Class Teachers. */
  setTeachers(
    workspaceId: string,
    classroomId: string,
    staffIds: readonly string[],
  ): Promise<void>;
  options(
    workspaceId: string,
    query: { centreId: string; academicYearId: string },
  ): Promise<Omit<ClassroomOptionsView, "academicYear">>;
};
