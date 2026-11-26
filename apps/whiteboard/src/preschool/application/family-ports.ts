import type { AttendanceStatus, CollectedByKind } from "../domain/attendance";
import type { DailyReportContent } from "../domain/daily-report";
import type { IsoDate } from "../domain/dates";

/** What one Child's family Home card is computed from. */
export type FamilyChildFacts = {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  dateOfBirth: IsoDate;
  admissionNumber: string;
  classroomName: string | null;
  programmeName: string | null;
  centre: { id: string; name: string; phone: string | null };
  classTeachers: string[];
  attendance: {
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
    collectedByKind: CollectedByKind | null;
    collectedByName: string | null;
    /** The Authorised Pickup's relationship when one collected the Child. */
    pickupRelationship: string | null;
  } | null;
  latestReport:
    (DailyReportContent & { date: IsoDate; publishedAt: string | null }) | null;
  /** Invoices not cancelled. */
  invoices: {
    label: string;
    dueOn: IsoDate;
    amountPaise: number;
    concessionPaise: number;
    paidPaise: number;
  }[];
};

export type FamilyStore = {
  /** These Children of the Workspace that are not deleted, by first name. */
  children(
    workspaceId: string,
    childIds: readonly string[],
    today: IsoDate,
  ): Promise<FamilyChildFacts[]>;
};
