import { queryOptions } from "@tanstack/react-query";

import { classApiPath } from "./classes";
import { apiJson } from "./http";

export type CalendarItem = {
  id: string;
  batchId: string;
  batchName: string;
  courseId: string;
  courseName: string;
  studentName: string | null;
  classMode: "offline" | "online" | "hybrid";
  room: string | null;
  joinUrl: string | null;
  meetingOption: "external" | "whiteboard";
  timezone: string;
  timings: { daysOfWeek: number[]; startTime: string; endTime: string }[];
  activeFrom: string;
};

export type ClassSlotTime = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ClassChange = {
  id: string;
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: "cancelled" | "moved";
  reason: string | null;
  movedTo: ClassSlotTime | null;
};

export type Holiday = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
};

export type CalendarPermissions = {
  changeClasses: boolean;
  manageHolidays: boolean;
};

export type CalendarResponse = {
  items: CalendarItem[];
  classChanges: ClassChange[];
  holidays: Holiday[];
  permissions: CalendarPermissions;
};

export type ClassKey = { batchId: string; date: string; startTime: string };

export const calendarQueries = {
  key: { all: ["calendar"] as const },
  schedule: (sessionScope: string) =>
    queryOptions({
      queryKey: [...calendarQueries.key.all, sessionScope] as const,
      queryFn: () =>
        apiJson<CalendarResponse>("/api/training-institute/calendar"),
    }),
};

const jsonHeaders = { "content-type": "application/json" };

export const cancelClass = (key: ClassKey, reason: string | null) =>
  apiJson<ClassChange>(
    `${classApiPath(key.batchId, key.date, key.startTime)}/cancel`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ reason }),
    },
  );

export const moveClass = (
  key: ClassKey,
  input: ClassSlotTime & { reason: string | null },
) =>
  apiJson<ClassChange>(
    `${classApiPath(key.batchId, key.date, key.startTime)}/move`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    },
  );

export const restoreClass = (key: ClassKey) =>
  apiJson<undefined>(
    `${classApiPath(key.batchId, key.date, key.startTime)}/restore`,
    {
      method: "POST",
    },
  );

export const declareHoliday = (input: {
  startDate: string;
  endDate: string;
  reason: string | null;
}) =>
  apiJson<Holiday>("/api/training-institute/holidays", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });

export const removeHoliday = (id: string) =>
  apiJson<undefined>(
    `/api/training-institute/holidays/${encodeURIComponent(id)}/remove`,
    {
      method: "POST",
    },
  );
