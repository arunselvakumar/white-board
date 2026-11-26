import type { PreschoolChildFormOptions } from "@/src/queries/preschool/children";

import { CENTRE_IDS } from "./preschool-story-api";

// Shared data for Preschool stories: the form options of a Centre with this
// year's Classrooms, and the ids stories refer to.

export const NURSERY_ID = "6a0e8400-e29b-41d4-a716-446655440002";
export const LKG_ID = "6a0e8400-e29b-41d4-a716-446655440003";
export const CURRENT_YEAR_ID = "5c0e8400-e29b-41d4-a716-446655440000";
export const NEXT_YEAR_ID = "5c0e8400-e29b-41d4-a716-446655440001";
export const NURSERY_A_ID = "6b0e8400-e29b-41d4-a716-446655440001";
export const NURSERY_B_ID = "6b0e8400-e29b-41d4-a716-446655440002";
export const LKG_NEXT_ID = "6b0e8400-e29b-41d4-a716-446655440003";

export const CHILD_FORM_OPTIONS: PreschoolChildFormOptions = {
  centreId: CENTRE_IDS.annaNagar,
  currentAcademicYearId: CURRENT_YEAR_ID,
  academicYears: [
    {
      id: CURRENT_YEAR_ID,
      name: "2026–27",
      startsOn: "2026-04-01",
      endsOn: "2027-03-31",
      isCurrent: true,
    },
    {
      id: NEXT_YEAR_ID,
      name: "2027–28",
      startsOn: "2027-04-01",
      endsOn: "2028-03-31",
      isCurrent: false,
    },
  ],
  programmes: [
    {
      id: "6a0e8400-e29b-41d4-a716-446655440001",
      name: "Playgroup",
      minAgeMonths: 18,
      maxAgeMonths: 35,
      ageRangeText: "1 y 6 m – 2 y 11 m",
      isDaycare: false,
    },
    {
      id: NURSERY_ID,
      name: "Nursery (Pre-KG)",
      minAgeMonths: 36,
      maxAgeMonths: 47,
      ageRangeText: "3 y – 3 y 11 m",
      isDaycare: false,
    },
    {
      id: LKG_ID,
      name: "LKG",
      minAgeMonths: 48,
      maxAgeMonths: 59,
      ageRangeText: "4 y – 4 y 11 m",
      isDaycare: false,
    },
  ],
  classrooms: [
    {
      id: NURSERY_A_ID,
      name: "Nursery A",
      programmeId: NURSERY_ID,
      academicYearId: CURRENT_YEAR_ID,
      capacity: 20,
      filled: 18,
      seatsLeft: 2,
    },
    {
      id: NURSERY_B_ID,
      name: "Nursery B",
      programmeId: NURSERY_ID,
      academicYearId: CURRENT_YEAR_ID,
      capacity: 20,
      filled: 20,
      seatsLeft: 0,
    },
    {
      id: LKG_NEXT_ID,
      name: "LKG A",
      programmeId: LKG_ID,
      academicYearId: NEXT_YEAR_ID,
      capacity: 25,
      filled: 0,
      seatsLeft: 25,
    },
  ],
};
