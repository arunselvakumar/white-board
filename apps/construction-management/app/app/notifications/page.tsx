import type { Metadata } from "next";

import { NotificationsScreen } from "@/components/notifications/notifications-screen";
import { NotificationsScreenSkeleton } from "@/components/notifications/notifications-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <QuerySuspense fallback={<NotificationsScreenSkeleton />}>
      <NotificationsScreen />
    </QuerySuspense>
  );
}
