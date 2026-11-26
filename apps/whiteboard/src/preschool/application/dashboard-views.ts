// JSON-ready. Dates are YYYY-MM-DD; money is whole paise.

export type DashboardClassroomView = {
  id: string;
  name: string;
  programmeName: string;
  /** Children with an active Admission. */
  childCount: number;
  capacity: number;
  /** Marked present today. */
  present: number;
  /** Marked at all today (present, absent or leave). */
  marked: number;
};

export type DashboardFollowUpView = {
  id: string;
  childName: string;
  parentName: string;
  parentPhone: string;
  nextFollowUpOn: string;
};

export type DashboardDueView = {
  childId: string;
  name: string;
  classroomName: string | null;
  overduePaise: number;
};

export type DashboardLowStockView = {
  itemId: string;
  name: string;
  unit: string;
  onHand: number;
  reorderLevel: number;
};

export type DashboardUpcomingView = {
  id: string;
  title: string;
  kind: "event" | "holiday";
  startsOn: string;
};

/** The Centre Dashboard: one read for today in India and the current Academic Year. */
export type CentreDashboardView = {
  centreId: string;
  date: string;
  academicYear: { id: string; name: string } | null;
  /** What a new Centre still has to do; all true once it is running. */
  setup: {
    hasClassrooms: boolean;
    hasStaff: boolean;
    hasFeeStructure: boolean;
    hasChildren: boolean;
  };
  children: {
    /** Children whose status is active. */
    active: number;
    /** Over the year's Classrooms that are not archived. */
    capacity: number;
    seatsLeft: number;
    classrooms: DashboardClassroomView[];
  };
  attendanceToday: {
    present: number;
    absent: number;
    leave: number;
    /** Children on a Classroom roster with no mark today. */
    notMarked: number;
    checkedOut: number;
    /** Present and not yet collected. */
    stillHere: number;
  };
  /** Over the Children present today. */
  dailyReportsToday: { published: number; draft: number; notStarted: number };
  fees: {
    collectedTodayPaise: number;
    collectedThisMonthPaise: number;
    /** Everything still owed, due or not. */
    duePaise: number;
    /** Owed on Invoices whose due date has passed. */
    overduePaise: number;
    childrenWithDues: number;
  };
  /** Up to 5, most overdue first. */
  topDues: DashboardDueView[];
  enquiries: {
    open: number;
    newThisMonth: number;
    admittedThisMonth: number;
    /** Up to 5 open Enquiries whose follow-up is today or earlier. */
    followUpsDue: DashboardFollowUpView[];
  };
  /** Up to 5 Stock Items at or below their reorder level here. */
  lowStock: DashboardLowStockView[];
  /** The next 3 events and holidays for this Centre or every Centre. */
  upcoming: DashboardUpcomingView[];
};
