import type { Gender } from "../domain/child";
import type { IsoDate } from "../domain/dates";
import type {
  EnquiryActivityKind,
  EnquiryListFilter,
  EnquirySource,
  EnquiryStatus,
} from "../domain/enquiry";
import type { ListCursor } from "./list-cursor";
import type {
  EnquiryActivityView,
  EnquiryPhoneMatchesView,
  EnquiryView,
} from "./enquiry-views";

/** An Enquiry as stored; the handler adds what depends on today. */
export type EnquiryRecord = Omit<EnquiryView, "followUpDue" | "childAgeText">;

export type EnquiryDetails = {
  childName: string;
  childDateOfBirth: IsoDate | null;
  childGender: Gender | null;
  parentName: string;
  parentPhone: string;
  parentEmail: string | null;
  programmeId: string | null;
  source: EnquirySource;
  notes: string | null;
};

export type EnquiryChange = Partial<
  EnquiryDetails & {
    status: EnquiryStatus;
    visitOn: IsoDate | null;
    nextFollowUpOn: IsoDate | null;
    lostReason: string | null;
  }
>;

export type NewEnquiryActivity = {
  kind: EnquiryActivityKind;
  note: string | null;
  toStatus: EnquiryStatus | null;
};

export type EnquiryAuthor = { userId: string; userName: string };

/** Write side. */
export type EnquiryStore = {
  /** Runs `work` in one transaction; locks last until it ends. */
  transaction<T>(work: (store: EnquiryStore) => Promise<T>): Promise<T>;
  /** Loads the Enquiry and locks its row. */
  lock(
    workspaceId: string,
    id: string,
  ): Promise<{
    id: string;
    centreId: string;
    status: EnquiryStatus;
    visitOn: IsoDate | null;
    programmeId: string | null;
  } | null>;
  insert(
    enquiry: EnquiryDetails & {
      id: string;
      workspaceId: string;
      centreId: string;
      nextFollowUpOn: IsoDate | null;
      createdByUserId: string;
    },
  ): Promise<void>;
  update(workspaceId: string, id: string, change: EnquiryChange): Promise<void>;
  /**
   * Appends to the Enquiry's history at `at`, each entry a millisecond after
   * the one before so newest-first stays in the order given.
   */
  addActivities(
    workspaceId: string,
    enquiryId: string,
    author: EnquiryAuthor,
    at: Date,
    activities: NewEnquiryActivity[],
  ): Promise<void>;
  /** Status changes, newest first. */
  statusHistory(
    enquiryId: string,
  ): Promise<{ toStatus: EnquiryStatus | null }[]>;
  programme(
    workspaceId: string,
    id: string,
  ): Promise<{ archived: boolean } | null>;
};

export type EnquiryListParams = {
  workspaceId: string;
  centreId: string;
  status: EnquiryStatus | null;
  filter: EnquiryListFilter;
  q: string | null;
  limit: number;
  after: ListCursor | null;
  today: IsoDate;
};

/** Read side. */
export type EnquiryReader = {
  /** Newest first, `limit + 1` rows. */
  list(
    params: EnquiryListParams,
  ): Promise<{ rows: EnquiryRecord[]; total: number }>;
  get(workspaceId: string, id: string): Promise<EnquiryRecord | null>;
  /** Newest first. */
  activities(enquiryId: string): Promise<EnquiryActivityView[]>;
  countByStatus(
    workspaceId: string,
    centreId: string,
  ): Promise<Partial<Record<EnquiryStatus, number>>>;
  countFollowUpsDue(
    workspaceId: string,
    centreId: string,
    today: IsoDate,
  ): Promise<number>;
  phoneMatches(
    workspaceId: string,
    centreId: string,
    phone: string,
    excludeEnquiryId: string | null,
  ): Promise<EnquiryPhoneMatchesView>;
};
