import type { Metadata } from "next";

import { MyLeavesPage } from "@/app/app/hrms/leave/my/_components/my-leaves-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/leave/my`).title,
};

export default function MyLeavesRoute() {
  return <MyLeavesPage />;
}
