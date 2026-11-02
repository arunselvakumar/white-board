import { redirect } from "next/navigation";

import { HRMS_PATH } from "@/lib/hrms-nav";

/** Salary opens on My Salary. */
export default function HrmsSalaryPage() {
  redirect(`${HRMS_PATH}/salary/my`);
}
