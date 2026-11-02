import { redirect } from "next/navigation";

import { HRMS_PATH } from "@/lib/hrms-nav";

/** Configuration opens on Settings. */
export default function HrmsConfigurationPage() {
  redirect(`${HRMS_PATH}/configuration/settings`);
}
