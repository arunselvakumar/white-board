import type { Metadata } from "next";

import { CalendarScreen } from "@/app/(app)/calendar/_components/calendar-screen";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <CalendarScreen />;
}
