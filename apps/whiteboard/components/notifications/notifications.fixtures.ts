import type {
  NotificationView,
  NotificationsView,
} from "@/src/queries/notifications";

const TALLY = "660e8400-e29b-41d4-a716-446655440101";
const DCA = "660e8400-e29b-41d4-a716-446655440102";

/** Asha's Parent gave notice for two Tally Classes; unread. */
export const ashaGiven: NotificationView = {
  id: "a20e8400-e29b-41d4-a716-446655440001",
  kind: "absence_notice_given",
  createdAt: "2026-10-12T04:15:00.000Z",
  readAt: null,
  payload: {
    studentId: "880e8400-e29b-41d4-a716-446655440101",
    studentName: "Asha Rao",
    batchId: TALLY,
    batchName: "Tally Evening",
    courseName: "Tally",
    timezone: "Asia/Kolkata",
    classes: [
      { date: "2026-10-15", startTime: "17:00", endTime: "18:00" },
      { date: "2026-10-16", startTime: "17:00", endTime: "18:00" },
    ],
    reason: "sick",
    note: "Fever since Sunday; the doctor said two days of rest.",
    by: { role: "parent", name: "Ramesh Rao" },
  },
};

/** Vikram withdrew his own notice; unread. */
export const vikramWithdrawn: NotificationView = {
  id: "a20e8400-e29b-41d4-a716-446655440002",
  kind: "absence_notice_withdrawn",
  createdAt: "2026-10-12T03:05:00.000Z",
  readAt: null,
  payload: {
    studentId: "880e8400-e29b-41d4-a716-446655440102",
    studentName: "Vikram Nair",
    batchId: DCA,
    batchName: "DCA Morning",
    courseName: "DCA",
    timezone: "Asia/Kolkata",
    classes: [{ date: "2026-10-13", startTime: "09:00", endTime: "10:00" }],
    reason: "travel",
    note: null,
    by: { role: "student", name: "Vikram Nair" },
  },
};

/** Meera gave notice for a week away; already read. */
export const meeraGiven: NotificationView = {
  id: "a20e8400-e29b-41d4-a716-446655440003",
  kind: "absence_notice_given",
  createdAt: "2026-10-10T12:40:00.000Z",
  readAt: "2026-10-10T13:00:00.000Z",
  payload: {
    studentId: "880e8400-e29b-41d4-a716-446655440103",
    studentName: "Meera Pillai",
    batchId: TALLY,
    batchName: "Tally Evening",
    courseName: "Tally",
    timezone: "Asia/Kolkata",
    classes: [
      { date: "2026-10-19", startTime: "17:00", endTime: "18:00" },
      { date: "2026-10-20", startTime: "17:00", endTime: "18:00" },
      { date: "2026-10-21", startTime: "17:00", endTime: "18:00" },
      { date: "2026-10-22", startTime: "17:00", endTime: "18:00" },
    ],
    reason: "family",
    note: "Cousin's wedding in Madurai.",
    by: { role: "student", name: "Meera Pillai" },
  },
};

export const NOTIFICATIONS = [ashaGiven, vikramWithdrawn, meeraGiven];

export function notificationsPage(
  items: NotificationView[],
  cursors: Partial<Pick<NotificationsView, "nextCursor" | "prevCursor">> = {},
  total = items.length,
): NotificationsView {
  return {
    items,
    total,
    unreadCount: items.filter((item) => item.readAt == null).length,
    nextCursor: cursors.nextCursor ?? null,
    prevCursor: cursors.prevCursor ?? null,
  };
}

/** The same Notifications with every one read. */
export function allRead(items: NotificationView[]): NotificationView[] {
  return items.map((item) => ({
    ...item,
    readAt: item.readAt ?? "2026-10-12T05:00:00.000Z",
  }));
}
