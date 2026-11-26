import type { PreschoolActor, PreschoolRole } from "./access";

// JSON-ready. Calendar dates are YYYY-MM-DD.

export type MeCentreView = {
  id: string;
  name: string;
  code: string;
  ownership: "company_owned" | "franchised";
  status: "active" | "closed";
};

export type MeChildView = {
  id: string;
  centreId: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
};

/** Who the User is in this Preschool and what they may open. */
export type MeView = {
  role: PreschoolRole;
  userName: string;
  /** 1–12; the Academic Year starts on the 1st of this month. */
  academicYearStartMonth: number;
  currentAcademicYear: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
  };
  /** The Workspace has more than one Centre, so Head Office screens apply. */
  hasSeveralCentres: boolean;
  /** Centres the User may open, by name. */
  centres: MeCentreView[];
  /** A Teacher's Classrooms. */
  classroomIds: string[];
  /** A Parent's Children. */
  children: MeChildView[];
};

export type MeReader = {
  read(actor: PreschoolActor): Promise<MeView>;
};
