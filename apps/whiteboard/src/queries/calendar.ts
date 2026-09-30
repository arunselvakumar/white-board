import { queryOptions } from "@tanstack/react-query";

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

export const calendarQueries = {
  key: { all: ["calendar"] as const },
  schedule: (sessionScope: string) => queryOptions({
    queryKey: [...calendarQueries.key.all, sessionScope] as const,
    queryFn: () => apiJson<{ items: CalendarItem[] }>("/api/calendar"),
  }),
};
