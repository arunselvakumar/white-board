import { redirect } from "next/navigation";

import { EMPLOYEES_PATH } from "@/lib/staff-nav";

/** Staff opens on Employees (ADR CM-0055 §5). */
export default function StaffArea() {
  redirect(EMPLOYEES_PATH);
}
