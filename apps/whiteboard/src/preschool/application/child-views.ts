import type { AdmissionEndReason } from "../domain/admission";
import type { ChildStatus, Gender } from "../domain/child";
import type { IsoDate } from "../domain/dates";
import type { ListPage } from "./list-cursor";

// JSON-ready. Calendar dates are YYYY-MM-DD; instants are ISO strings. No
// view here carries a fee amount, so Teachers may read them.

export type ChildParentView = {
  name: string | null;
  /** 10 digits. */
  phone: string | null;
  /** Lower case. */
  email: string | null;
  occupation: string | null;
};

export type ChildAddressView = {
  line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export type EmergencyContactView = {
  name: string | null;
  phone: string | null;
  relationship: string | null;
};

export type ChildHealthView = {
  allergies: string | null;
  medicalConditions: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  immunisationUpToDate: boolean | null;
};

/** Documents the family has shown: ticks, never files or numbers. */
export type ChildDocumentsView = {
  hasBirthCertificate: boolean;
  hasAadhaar: boolean;
  hasImmunisationCard: boolean;
  hasPhotos: boolean;
  hasAddressProof: boolean;
};

export type AuthorisedPickupView = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  photoUrl: string | null;
};

export type AdmissionView = {
  id: string;
  academicYearId: string;
  academicYearName: string;
  programmeId: string;
  programmeName: string;
  classroomId: string;
  classroomName: string;
  admittedOn: IsoDate;
  status: "active" | "ended";
  endedOn: IsoDate | null;
  endReason: AdmissionEndReason | null;
};

export type ChildListItemView = {
  id: string;
  centreId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string | null;
  name: string;
  photoUrl: string | null;
  dateOfBirth: IsoDate;
  /** Age today in India: "3 y 4 m". */
  ageText: string;
  gender: Gender;
  /** From the active Admission; null when there is none. */
  programmeId: string | null;
  programmeName: string | null;
  classroomId: string | null;
  classroomName: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  status: ChildStatus;
};

export type ChildPageView = ListPage<ChildListItemView>;

/** Another Child of the Workspace sharing a parent phone or email. */
export type SiblingView = {
  id: string;
  name: string;
  classroomName: string | null;
  status: ChildStatus;
};

export type ChildProfileView = {
  id: string;
  centreId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string | null;
  name: string;
  dateOfBirth: IsoDate;
  ageText: string;
  gender: Gender;
  bloodGroup: string | null;
  photoUrl: string | null;
  motherTongue: string | null;
  address: ChildAddressView;
  father: ChildParentView;
  mother: ChildParentView;
  emergencyContact: EmergencyContactView;
  health: ChildHealthView;
  documents: ChildDocumentsView;
  status: ChildStatus;
  withdrawnOn: IsoDate | null;
  withdrawReason: string | null;
  currentAdmission: AdmissionView | null;
  /** Newest first. */
  admissions: AdmissionView[];
  authorisedPickups: AuthorisedPickupView[];
  siblings: SiblingView[];
  /** The Enquiry this Child was admitted from. */
  enquiryId: string | null;
  createdAt: string;
  /** Send back as `updatedAt` on an edit; a newer save answers 409 `CHILD_CHANGED`. */
  updatedAt: string;
};

export type AdmitChildView = {
  child: ChildProfileView;
  /** The Child's age is outside the Programme's range. Never a refusal. */
  ageWarning: string | null;
};

/** What the admission, move and promote forms choose from, for one Centre. */
export type ChildFormOptionsView = {
  centreId: string;
  currentAcademicYearId: string;
  /** Oldest first. */
  academicYears: {
    id: string;
    name: string;
    startsOn: IsoDate;
    endsOn: IsoDate;
    isCurrent: boolean;
  }[];
  /** Programmes that are not archived, in their order. */
  programmes: {
    id: string;
    name: string;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
    /** "3 y – 3 y 11 m"; null when any age fits. */
    ageRangeText: string | null;
    isDaycare: boolean;
  }[];
  /** The Centre's Classrooms that are not archived, every Academic Year. */
  classrooms: {
    id: string;
    name: string;
    programmeId: string;
    academicYearId: string;
    capacity: number;
    /** Active Admissions. */
    filled: number;
    seatsLeft: number;
  }[];
};
