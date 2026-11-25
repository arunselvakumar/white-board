import type { IsoDate } from "../domain/dates";
import type {
  DashboardFollowUpView,
  DashboardUpcomingView,
} from "./dashboard-views";

/** The days a dashboard read covers, in India. */
export type DashboardWindow = {
  today: IsoDate;
  monthStartsOn: IsoDate;
  monthEndsOn: IsoDate;
};

/** An Invoice with something still owed. */
export type OutstandingInvoice = {
  childId: string;
  childName: string;
  classroomName: string | null;
  dueOn: IsoDate;
  amountPaise: number;
  concessionPaise: number;
  paidPaise: number;
};

/** What the Centre Dashboard is computed from. */
export type CentreDashboardFacts = {
  academicYear: { id: string; name: string } | null;
  classrooms: {
    id: string;
    name: string;
    programmeName: string;
    capacity: number;
    childIds: string[];
  }[];
  activeChildren: number;
  activeStaff: number;
  hasFeeStructure: boolean;
  attendance: {
    childId: string;
    classroomId: string;
    status: "present" | "absent" | "leave";
    checkedOut: boolean;
  }[];
  reports: { childId: string; status: "draft" | "published" }[];
  outstanding: OutstandingInvoice[];
  collectedTodayPaise: number;
  collectedThisMonthPaise: number;
  openEnquiries: number;
  enquiriesThisMonth: number;
  admittedThisMonth: number;
  followUpsDue: DashboardFollowUpView[];
  stock: {
    itemId: string;
    name: string;
    unit: string;
    reorderLevel: number | null;
    onHand: number;
  }[];
  upcoming: DashboardUpcomingView[];
};

export type DashboardStore = {
  centre(
    workspaceId: string,
    centreId: string,
    window: DashboardWindow,
  ): Promise<CentreDashboardFacts>;
};
