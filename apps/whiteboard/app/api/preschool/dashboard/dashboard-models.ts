import { z } from "zod";

const paise = z.number().int();
const count = z.number().int().min(0);

export const PreschoolDashboardRequestModel = z.object({ centreId: z.uuid() });

export const PreschoolMonthRequestModel = z.object({
  /** YYYY-MM; this month in India when left out. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export const PreschoolCentreDashboardResponseModel = z.object({
  centreId: z.uuid(),
  date: z.iso.date(),
  academicYear: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  setup: z.object({
    hasClassrooms: z.boolean(),
    hasStaff: z.boolean(),
    hasFeeStructure: z.boolean(),
    hasChildren: z.boolean(),
  }),
  children: z.object({
    active: count,
    capacity: count,
    seatsLeft: count,
    classrooms: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        programmeName: z.string(),
        childCount: count,
        capacity: count,
        present: count,
        marked: count,
      }),
    ),
  }),
  attendanceToday: z.object({
    present: count,
    absent: count,
    leave: count,
    notMarked: count,
    checkedOut: count,
    stillHere: count,
  }),
  dailyReportsToday: z.object({
    published: count,
    draft: count,
    notStarted: count,
  }),
  fees: z.object({
    collectedTodayPaise: paise,
    collectedThisMonthPaise: paise,
    duePaise: paise,
    overduePaise: paise,
    childrenWithDues: count,
  }),
  topDues: z.array(
    z.object({
      childId: z.uuid(),
      name: z.string(),
      classroomName: z.string().nullable(),
      overduePaise: paise,
    }),
  ),
  enquiries: z.object({
    open: count,
    newThisMonth: count,
    admittedThisMonth: count,
    followUpsDue: z.array(
      z.object({
        id: z.uuid(),
        childName: z.string(),
        parentName: z.string(),
        parentPhone: z.string(),
        nextFollowUpOn: z.iso.date(),
      }),
    ),
  }),
  lowStock: z.array(
    z.object({
      itemId: z.uuid(),
      name: z.string(),
      unit: z.string(),
      onHand: z.number().int(),
      reorderLevel: z.number().int(),
    }),
  ),
  upcoming: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      kind: z.enum(["event", "holiday"]),
      startsOn: z.iso.date(),
    }),
  ),
});

const headOfficeFigures = {
  activeChildren: count,
  capacity: count,
  occupancyPercent: count,
  presentToday: count,
  collectedPaise: paise,
  duePaise: paise,
  overduePaise: paise,
  openEnquiries: count,
  admissions: count,
  royaltyDuePaise: paise,
};

export const PreschoolHeadOfficeResponseModel = z.object({
  month: z.string(),
  date: z.iso.date(),
  centres: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      code: z.string(),
      ownership: z.enum(["company_owned", "franchised"]),
      status: z.enum(["active", "closed"]),
      royaltyBps: count,
      ...headOfficeFigures,
    }),
  ),
  totals: z.object(headOfficeFigures),
});
