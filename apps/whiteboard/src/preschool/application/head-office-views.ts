// JSON-ready. Money is whole paise.

/** One Centre on the Head Office dashboard. */
export type HeadOfficeCentreView = {
  id: string;
  name: string;
  code: string;
  ownership: "company_owned" | "franchised";
  status: "active" | "closed";
  activeChildren: number;
  /** Seats over the current Academic Year's Classrooms. */
  capacity: number;
  /** Whole per cent of seats taken. */
  occupancyPercent: number;
  presentToday: number;
  /** Fee Payments received in the month. */
  collectedPaise: number;
  /** Owed today, due or not. */
  duePaise: number;
  overduePaise: number;
  openEnquiries: number;
  /** Admissions made in the month. */
  admissions: number;
  royaltyBps: number;
  /** For the month; 0 for a Company-owned Centre. */
  royaltyDuePaise: number;
};

/**
 * Every Centre side by side for a month. Collections, admissions and
 * royalty are for the month; children, attendance, dues and enquiries are
 * as of today.
 */
export type HeadOfficeView = {
  month: string;
  date: string;
  centres: HeadOfficeCentreView[];
  totals: Omit<
    HeadOfficeCentreView,
    "id" | "name" | "code" | "ownership" | "status" | "royaltyBps"
  >;
};
