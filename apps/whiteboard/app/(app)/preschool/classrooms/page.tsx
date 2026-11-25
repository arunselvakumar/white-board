import type { Metadata } from "next";

import { ClassroomsScreen } from "@/app/(app)/preschool/classrooms/_components/classrooms-screen";
import { RoleGate } from "@/app/(app)/preschool/_components/active-centre-provider";

export const metadata: Metadata = { title: "Classrooms" };

export default function ClassroomsPage() {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <ClassroomsScreen />
    </RoleGate>
  );
}
