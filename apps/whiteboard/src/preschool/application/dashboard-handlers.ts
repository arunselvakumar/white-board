import { dailyReportCounts, monthOf, monthSpan } from "../domain/dashboard";
import { todayInIndia } from "../domain/dates";
import { invoiceDuePaise } from "../domain/fees";
import { isLowStock } from "../domain/stock";
import { assertManagerOf, type PreschoolActor } from "./access";
import type {
  DashboardStore,
  DashboardWindow,
  OutstandingInvoice,
} from "./dashboard-ports";
import type { CentreDashboardView, DashboardDueView } from "./dashboard-views";

const TOP = 5;

/** Today's window: the date in India and its month. */
export function dashboardWindow(now: Date): DashboardWindow {
  const today = todayInIndia(now);
  const { startsOn, endsOn } = monthSpan(monthOf(today));
  return { today, monthStartsOn: startsOn, monthEndsOn: endsOn };
}

/** Due, overdue and who owes most, from the outstanding Invoices. */
export function feeFigures(
  invoices: readonly OutstandingInvoice[],
  today: string,
): {
  duePaise: number;
  overduePaise: number;
  childrenWithDues: number;
  topDues: DashboardDueView[];
} {
  let duePaise = 0;
  let overduePaise = 0;
  const byChild = new Map<string, DashboardDueView & { duePaise: number }>();
  for (const invoice of invoices) {
    const due = invoiceDuePaise({ ...invoice, cancelled: false });
    if (due === 0) continue;
    const overdue = invoice.dueOn < today ? due : 0;
    duePaise += due;
    overduePaise += overdue;
    const row = byChild.get(invoice.childId) ?? {
      childId: invoice.childId,
      name: invoice.childName,
      classroomName: invoice.classroomName,
      overduePaise: 0,
      duePaise: 0,
    };
    row.overduePaise += overdue;
    row.duePaise += due;
    byChild.set(invoice.childId, row);
  }
  const topDues = [...byChild.values()]
    .filter((row) => row.overduePaise > 0)
    .sort(
      (a, b) => b.overduePaise - a.overduePaise || a.name.localeCompare(b.name),
    )
    .slice(0, TOP)
    .map(({ duePaise: _due, ...row }) => row);
  return { duePaise, overduePaise, childrenWithDues: byChild.size, topDues };
}

/** The Centre Dashboard (ADR-0055): the Owner or a Centre Head of the Centre. */
export class DashboardHandlers {
  constructor(
    private readonly deps: { store: DashboardStore; now: () => Date },
  ) {}

  async centre(
    actor: PreschoolActor,
    query: { centreId: string },
  ): Promise<CentreDashboardView> {
    assertManagerOf(actor, query.centreId);
    const window = dashboardWindow(this.deps.now());
    const facts = await this.deps.store.centre(
      actor.workspaceId,
      query.centreId,
      window,
    );

    const marks = new Map(facts.attendance.map((mark) => [mark.childId, mark]));
    const classrooms = facts.classrooms.map((classroom) => {
      let present = 0;
      let marked = 0;
      for (const childId of classroom.childIds) {
        const mark = marks.get(childId);
        if (mark == null) continue;
        marked += 1;
        if (mark.status === "present") present += 1;
      }
      return {
        id: classroom.id,
        name: classroom.name,
        programmeName: classroom.programmeName,
        childCount: classroom.childIds.length,
        capacity: classroom.capacity,
        present,
        marked,
      };
    });
    const onRoster = new Set(facts.classrooms.flatMap((room) => room.childIds));
    const attendance = { present: 0, absent: 0, leave: 0, checkedOut: 0 };
    const presentIds: string[] = [];
    for (const mark of facts.attendance) {
      attendance[mark.status] += 1;
      if (mark.status === "present") presentIds.push(mark.childId);
      if (mark.checkedOut) attendance.checkedOut += 1;
    }
    const notMarked = [...onRoster].filter((id) => !marks.has(id)).length;
    const capacity = classrooms.reduce((sum, room) => sum + room.capacity, 0);
    const placed = classrooms.reduce((sum, room) => sum + room.childCount, 0);
    const fees = feeFigures(facts.outstanding, window.today);

    return {
      centreId: query.centreId,
      date: window.today,
      academicYear: facts.academicYear,
      setup: {
        hasClassrooms: classrooms.length > 0,
        hasStaff: facts.activeStaff > 0,
        hasFeeStructure: facts.hasFeeStructure,
        hasChildren: facts.activeChildren > 0,
      },
      children: {
        active: facts.activeChildren,
        capacity,
        seatsLeft: Math.max(0, capacity - placed),
        classrooms,
      },
      attendanceToday: {
        ...attendance,
        notMarked,
        stillHere: attendance.present - attendance.checkedOut,
      },
      dailyReportsToday: dailyReportCounts(
        presentIds,
        new Map(facts.reports.map((report) => [report.childId, report.status])),
      ),
      fees: {
        collectedTodayPaise: facts.collectedTodayPaise,
        collectedThisMonthPaise: facts.collectedThisMonthPaise,
        duePaise: fees.duePaise,
        overduePaise: fees.overduePaise,
        childrenWithDues: fees.childrenWithDues,
      },
      topDues: fees.topDues,
      enquiries: {
        open: facts.openEnquiries,
        newThisMonth: facts.enquiriesThisMonth,
        admittedThisMonth: facts.admittedThisMonth,
        followUpsDue: facts.followUpsDue,
      },
      lowStock: facts.stock
        .flatMap((item) =>
          item.reorderLevel != null &&
          isLowStock(item.onHand, item.reorderLevel)
            ? [{ ...item, reorderLevel: item.reorderLevel }]
            : [],
        )
        .sort(
          (a, b) =>
            a.onHand - a.reorderLevel - (b.onHand - b.reorderLevel) ||
            a.name.localeCompare(b.name),
        )
        .slice(0, TOP),
      upcoming: facts.upcoming,
    };
  }
}
