import type { ReactNode } from "react";

/** Attendance inside the project shell. Labour and Vendor are in the sidebar (ADR CM-0020). */
export default function ProjectAttendanceLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>;
}
