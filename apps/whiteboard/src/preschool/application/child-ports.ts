import type { AdmissionEndReason, ClassroomFacts } from "../domain/admission";
import type { ChildStatus, Gender } from "../domain/child";
import type { IsoDate } from "../domain/dates";
import type { EnquiryStatus } from "../domain/enquiry";
import type {
  ChildFormOptionsView,
  ChildListItemView,
  ChildProfileView,
  SiblingView,
} from "./child-views";
import type { ListCursor } from "./list-cursor";

/** A new Admission, told to whoever raises its Invoices. */
export type AdmittedChild = {
  workspaceId: string;
  admissionId: string;
  childId: string;
  centreId: string;
  programmeId: string;
  academicYearId: string;
  admittedOn: IsoDate;
};

/**
 * Called after an admission or promotion is committed. A failure is logged
 * and does not undo the Admission.
 */
export type AdmissionInvoicer = {
  onAdmitted(admission: AdmittedChild): Promise<void>;
};

/** Invites a Parent's email to the Workspace with member role `parent`. */
export type ParentInviter = {
  invite(input: {
    workspaceId: string;
    inviterUserId: string;
    email: string;
  }): Promise<void>;
};

// Child columns, already normalised: trimmed, blank as null, phones as 10
// digits, emails lower case.

export type ChildDetailsFields = {
  firstName: string;
  lastName: string | null;
  dateOfBirth: IsoDate;
  gender: Gender;
  bloodGroup: string | null;
  photoUrl: string | null;
  motherTongue: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export type ChildParentFields = {
  fatherName: string | null;
  fatherPhone: string | null;
  fatherEmail: string | null;
  fatherOccupation: string | null;
  motherName: string | null;
  motherPhone: string | null;
  motherEmail: string | null;
  motherOccupation: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
};

export type ChildHealthFields = {
  allergies: string | null;
  medicalConditions: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  immunisationUpToDate: boolean | null;
  hasBirthCertificate: boolean;
  hasAadhaar: boolean;
  hasImmunisationCard: boolean;
  hasPhotos: boolean;
  hasAddressProof: boolean;
};

export type ChildFields = ChildDetailsFields &
  ChildParentFields &
  ChildHealthFields;

export type PickupFields = {
  name: string;
  relationship: string;
  phone: string;
  photoUrl: string | null;
};

export type NewAdmission = {
  id: string;
  workspaceId: string;
  centreId: string;
  childId: string;
  academicYearId: string;
  programmeId: string;
  classroomId: string;
  admittedOn: IsoDate;
};

/** A Child row locked for a change, with its active Admission. */
export type LockedChild = {
  id: string;
  centreId: string;
  status: ChildStatus;
  dateOfBirth: IsoDate;
  fatherEmail: string | null;
  motherEmail: string | null;
  updatedAt: string;
  current: {
    id: string;
    classroomId: string;
    programmeId: string;
    academicYearId: string;
    academicYearStartsOn: IsoDate;
    admittedOn: IsoDate;
  } | null;
};

export type ClassroomRecord = ClassroomFacts & {
  name: string;
  capacity: number;
};

/** Write side. */
export type ChildStore = {
  /** Runs `work` in one transaction; locks last until it ends. */
  transaction<T>(work: (store: ChildStore) => Promise<T>): Promise<T>;
  classroom(workspaceId: string, id: string): Promise<ClassroomRecord | null>;
  /** Locks the Classroom row and counts its active Admissions. */
  lockSeats(classroomId: string): Promise<{ capacity: number; filled: number }>;
  programme(
    workspaceId: string,
    id: string,
  ): Promise<{
    id: string;
    name: string;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
    archived: boolean;
  } | null>;
  academicYear(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; startsOn: IsoDate } | null>;
  /** Takes the Centre's next Admission sequence with an atomic increment. */
  takeAdmissionSequence(
    workspaceId: string,
    centreId: string,
  ): Promise<{ centreCode: string; sequence: number }>;
  lockEnquiry(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; centreId: string; status: EnquiryStatus } | null>;
  /** Sets the Enquiry admitted and writes its status change. */
  markEnquiryAdmitted(input: {
    workspaceId: string;
    enquiryId: string;
    childId: string;
    at: Date;
    author: { userId: string; userName: string };
  }): Promise<void>;
  insertChild(
    child: ChildFields & {
      id: string;
      workspaceId: string;
      centreId: string;
      admissionNumber: string;
    },
    pickups: PickupFields[],
  ): Promise<void>;
  insertAdmission(admission: NewAdmission): Promise<void>;
  lockChild(workspaceId: string, id: string): Promise<LockedChild | null>;
  /** Also moves `updatedAt` on, even for an empty change. */
  updateChild(
    id: string,
    change: Partial<
      ChildFields & {
        status: ChildStatus;
        withdrawnOn: IsoDate | null;
        withdrawReason: string | null;
      }
    >,
  ): Promise<void>;
  replacePickups(
    workspaceId: string,
    childId: string,
    pickups: PickupFields[],
  ): Promise<void>;
  /** Moves an Admission's Invoices to the Admission that replaces it. */
  moveInvoices(fromAdmissionId: string, toAdmissionId: string): Promise<void>;
  endAdmission(
    id: string,
    endedOn: IsoDate,
    reason: AdmissionEndReason,
  ): Promise<void>;
};

export type ChildListParams = {
  workspaceId: string;
  centreId: string;
  /** Only Children with an active Admission in one of these Classrooms. */
  activeInClassroomIds: readonly string[] | null;
  status: ChildStatus | null;
  q: string | null;
  limit: number;
  after: ListCursor | null;
};

/** Read side. */
export type ChildReader = {
  /** By first name, `limit + 1` rows. */
  list(params: ChildListParams): Promise<{
    rows: Omit<ChildListItemView, "ageText">[];
    total: number;
  }>;
  profile(
    workspaceId: string,
    id: string,
  ): Promise<Omit<ChildProfileView, "ageText" | "siblings"> | null>;
  /** Other Children sharing any of these phones or emails, by name. */
  siblings(
    workspaceId: string,
    childId: string,
    match: { phones: string[]; emails: string[] },
  ): Promise<SiblingView[]>;
  options(
    workspaceId: string,
    centreId: string,
  ): Promise<
    Omit<ChildFormOptionsView, "programmes"> & {
      programmes: Omit<
        ChildFormOptionsView["programmes"][number],
        "ageRangeText"
      >[];
    }
  >;
};
