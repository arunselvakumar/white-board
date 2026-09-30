export type CalendarRole = "org:admin" | "org:teacher" | "org:student" | "org:parent";

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
  timings: { daysOfWeek: readonly number[]; startTime: string; endTime: string }[];
  activeFrom: string;
};

export type CalendarScheduleReader = {
  execute(input: { workspaceId: string; userId: string; role: CalendarRole; verifiedEmails?: string[]; includeClosed?: boolean }): Promise<CalendarItem[]>;
};
