"use client";

import { CourseCatalog } from "@/app/(app)/courses/_components/course-catalog";

const noop = () => undefined;

export default function CoursesLoading() {
  return (
    <CourseCatalog
      courses={[]}
      loading
      onAdd={noop}
      onEdit={noop}
      onArchive={noop}
    />
  );
}
