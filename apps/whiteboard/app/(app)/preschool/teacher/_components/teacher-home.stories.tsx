import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { PreschoolClassroom } from "@/src/queries/preschool/classrooms";

import { TeacherHomeScreen } from "./teacher-home-screen";

const NURSERY_A = "ad0e8400-e29b-41d4-a716-446655440001";

const CLASSROOM: PreschoolClassroom = {
  id: NURSERY_A,
  centreId: CENTRE_IDS.annaNagar,
  academicYearId: "ad0e8400-e29b-41d4-a716-446655440010",
  programmeId: "ad0e8400-e29b-41d4-a716-446655440020",
  programmeName: "Nursery (Pre-KG)",
  name: "Nursery A",
  capacity: 20,
  childCount: 17,
  seatsLeft: 3,
  isArchived: false,
  teachers: [
    { staffId: "ad0e8400-e29b-41d4-a716-446655440030", name: "Meena R" },
  ],
};

function api(items: PreschoolClassroom[]) {
  return mockPreschoolApi({
    me: preschoolMe({
      role: "teacher",
      userName: "Meena R",
      centres: preschoolMe().centres.slice(0, 1),
      classroomIds: items.map((item) => item.id),
    }),
    routes: {
      "GET /classrooms": () => ({
        json: {
          academicYear: { id: CLASSROOM.academicYearId, name: "2026–27" },
          items,
        },
      }),
    },
  });
}

const meta = {
  title: "Preschool/Teacher Home",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/teacher" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
  render: () => <TeacherHomeScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MyClassrooms: Story = {
  beforeEach: () =>
    api([
      CLASSROOM,
      {
        ...CLASSROOM,
        id: "ad0e8400-e29b-41d4-a716-446655440002",
        name: "Daycare",
        programmeName: "Daycare",
        childCount: 1,
      },
    ]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Hello, Meena" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Nursery (Pre-KG) · 17 Children"),
    ).toBeVisible();
    await expect(canvas.getByText("Daycare · 1 Child")).toBeVisible();
    const card = within(
      canvas.getByRole("heading", { name: "Nursery A" }).closest("li") ??
        canvas.getByRole("list"),
    );
    await expect(
      card.getByRole("link", { name: "Take attendance for Nursery A" }),
    ).toHaveAttribute("href", `/preschool/attendance?classroomId=${NURSERY_A}`);
    await expect(
      card.getByRole("link", { name: "Daily Reports for Nursery A" }),
    ).toHaveAttribute(
      "href",
      `/preschool/daily-reports?classroomId=${NURSERY_A}`,
    );
  },
};

/** At 375 px the cards fit the column and the page does not scroll sideways. */
export const Phone: Story = {
  beforeEach: () => api([CLASSROOM]),
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", {
        name: "Take attendance for Nursery A",
      }),
    ).toBeVisible();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  },
};

export const NoClassrooms: Story = {
  beforeEach: () => api([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Classrooms yet")).toBeVisible();
  },
};
