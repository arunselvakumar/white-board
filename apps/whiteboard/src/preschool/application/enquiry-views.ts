import type { Gender } from "../domain/child";
import type { IsoDate } from "../domain/dates";
import type {
  EnquiryActivityKind,
  EnquirySource,
  EnquiryStatus,
} from "../domain/enquiry";
import type { ListPage } from "./list-cursor";

// JSON-ready. Calendar dates are YYYY-MM-DD; instants are ISO strings.

export type EnquiryView = {
  id: string;
  centreId: string;
  childName: string;
  childDateOfBirth: IsoDate | null;
  /** The Child's age today ("3 y 4 m"); null without a date of birth. */
  childAgeText: string | null;
  childGender: Gender | null;
  parentName: string;
  /** 10 digits. */
  parentPhone: string;
  parentEmail: string | null;
  programmeId: string | null;
  programmeName: string | null;
  source: EnquirySource;
  status: EnquiryStatus;
  visitOn: IsoDate | null;
  nextFollowUpOn: IsoDate | null;
  /** Open, and the next follow-up is today or earlier in India. */
  followUpDue: boolean;
  lostReason: string | null;
  notes: string | null;
  convertedChildId: string | null;
  convertedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type EnquiryActivityView = {
  id: string;
  kind: EnquiryActivityKind;
  note: string | null;
  /** Set on a status change. */
  toStatus: EnquiryStatus | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
};

export type EnquiryDetailView = EnquiryView & {
  /** Newest first. */
  activities: EnquiryActivityView[];
};

export type EnquiryPageView = ListPage<EnquiryView>;

/** What the pipeline board and the Centre Dashboard count. */
export type EnquirySummaryView = {
  centreId: string;
  byStatus: Record<EnquiryStatus, number>;
  /** New, Contacted, Visit scheduled and Visited together. */
  open: number;
  /** Open Enquiries whose next follow-up is today or earlier. */
  followUpsDue: number;
};

/** Records already holding this parent phone, so a form can warn of a duplicate. */
export type EnquiryPhoneMatchesView = {
  enquiries: {
    id: string;
    childName: string;
    parentName: string;
    status: EnquiryStatus;
    createdAt: string;
  }[];
  children: {
    id: string;
    name: string;
    admissionNumber: string;
    status: "active" | "withdrawn" | "graduated";
  }[];
};
