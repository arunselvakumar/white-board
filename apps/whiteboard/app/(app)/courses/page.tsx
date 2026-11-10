import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { CoursesScreen } from "@/app/(app)/courses/_components/courses-screen";
import { GET as listCourses } from "@/app/api/training-institute/courses/route";
import { COURSES_PAGE_SIZE, courseQueries } from "@/src/queries/courses";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";

export const metadata: Metadata = { title: "Courses" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const queryClient = getQueryClient();
  await prefetchRoute(
    queryClient,
    courseQueries.list({ limit: COURSES_PAGE_SIZE }),
    { "/api/training-institute/courses": listCourses },
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CoursesScreen />
    </HydrationBoundary>
  );
}
