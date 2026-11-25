"use client";

import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";

import { AcademicYearList } from "./academic-year-list";
import { ProgrammeList } from "./programme-list";

/** Head Office masters: Programmes and Academic Years (Owner). */
export function ProgrammesScreen() {
  return (
    <PreschoolPage title="Programmes" meta={null} width="form">
      <ProgrammeList />
      <AcademicYearList />
    </PreschoolPage>
  );
}
