import { redirect } from "next/navigation";

import { HRMS_PATH } from "@/lib/hrms-nav";

/** Leave opens on My Leaves. */
export default function HrmsLeavePage() {
  redirect(`${HRMS_PATH}/leave/my`);
}
