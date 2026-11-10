import type { Metadata } from "next";

import { NotificationsScreen } from "@/app/app/notifications/_components/notifications-screen";
import { NotificationsScreenSkeleton } from "@/app/app/_components/notifications/notifications-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <QuerySuspense fallback={<NotificationsScreenSkeleton />}>
      <NotificationsScreen />
    </QuerySuspense>
  );
}
