import { redirect } from "next/navigation";

import { LABOURS_PAGE_PATH } from "@/lib/staff-nav";

/** Staff opens on Labour. */
export default function StaffArea() {
  redirect(LABOURS_PAGE_PATH);
}
