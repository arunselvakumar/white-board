// JSON-ready. Calendar dates are YYYY-MM-DD.

export type ClassTeacherView = { staffId: string; name: string };

export type ClassroomView = {
  id: string;
  centreId: string;
  academicYearId: string;
  programmeId: string;
  programmeName: string;
  name: string;
  capacity: number;
  /** Children with an active Admission in this Classroom. */
  childCount: number;
  seatsLeft: number;
  isArchived: boolean;
  teachers: ClassTeacherView[];
};

export type AcademicYearRefView = { id: string; name: string };

export type ClassroomListView = {
  academicYear: AcademicYearRefView;
  items: ClassroomView[];
};

/** A Child on the roster. No fee data: Teachers read it too. */
export type RosterChildView = {
  childId: string;
  firstName: string;
  lastName: string | null;
  admissionNumber: string;
  dateOfBirth: string;
  photoUrl: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
};

export type ClassroomDetailView = ClassroomView & { roster: RosterChildView[] };

/** What admission and enquiry forms pick from. */
export type ClassroomOptionsView = {
  academicYear: AcademicYearRefView;
  programmes: {
    id: string;
    name: string;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
    isDaycare: boolean;
  }[];
  classrooms: {
    id: string;
    name: string;
    programmeId: string;
    programmeName: string;
    capacity: number;
    childCount: number;
    seatsLeft: number;
  }[];
};
