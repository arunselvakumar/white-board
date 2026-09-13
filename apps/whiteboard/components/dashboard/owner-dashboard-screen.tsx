"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { courseQueries } from "@/src/queries/courses";
import { dashboardQueries } from "@/src/queries/dashboard";

export function OwnerDashboardScreen() {
  const router = useRouter();
  const { data: dashboard } = useSuspenseQuery(dashboardQueries.get());
  const { data: courses } = useSuspenseQuery(courseQueries.list());

  return (
    <OwnerDashboard
      dashboard={dashboard}
      hasCourses={courses.total > 0}
      onAddCourse={() => {
        router.push("/courses/new");
      }}
      onOpenBatch={(id) => {
        router.push(`/batches/${id}`);
      }}
      onOpenStudent={(id) => {
        router.push(`/students/${id}`);
      }}
      onOpenStudents={() => {
        router.push("/students");
      }}
      onOpenFees={() => {
        router.push("/fees");
      }}
    />
  );
}
