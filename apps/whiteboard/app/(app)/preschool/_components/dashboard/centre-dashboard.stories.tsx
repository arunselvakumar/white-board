import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { PreschoolCentreDashboard } from "@/src/queries/preschool/dashboard";

import { CentreDashboardScreen } from "./centre-dashboard-screen";
import { expectFitsPhone, withPhoneFrame } from "../phone-frame";

const id = (n: number) =>
  `da0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;

const BUSY: PreschoolCentreDashboard = {
  centreId: CENTRE_IDS.annaNagar,
  date: "2026-11-25",
  academicYear: { id: id(90), name: "2026–27" },
  setup: {
    hasClassrooms: true,
    hasStaff: true,
    hasFeeStructure: true,
    hasChildren: true,
  },
  children: {
    active: 42,
    capacity: 55,
    seatsLeft: 13,
    classrooms: [
      {
        id: id(1),
        name: "Playgroup A",
        programmeName: "Playgroup",
        childCount: 12,
        capacity: 15,
        present: 10,
        marked: 12,
      },
      {
        id: id(2),
        name: "Nursery A",
        programmeName: "Nursery (Pre-KG)",
        childCount: 20,
        capacity: 20,
        present: 17,
        marked: 20,
      },
      {
        id: id(3),
        name: "LKG A",
        programmeName: "LKG",
        childCount: 10,
        capacity: 20,
        present: 0,
        marked: 0,
      },
    ],
  },
  attendanceToday: {
    present: 27,
    absent: 3,
    leave: 2,
    notMarked: 10,
    checkedOut: 9,
    stillHere: 18,
  },
  dailyReportsToday: { published: 14, draft: 6, notStarted: 7 },
  fees: {
    collectedTodayPaise: 1_250_000,
    collectedThisMonthPaise: 48_75_000_00,
    duePaise: 3_20_000_00,
    overduePaise: 1_85_000_00,
    childrenWithDues: 9,
  },
  topDues: [
    {
      childId: id(20),
      name: "Aadhya Kumar",
      classroomName: "Nursery A",
      overduePaise: 45_000_00,
    },
    {
      childId: id(21),
      name: "Ishaan Rao",
      classroomName: "LKG A",
      overduePaise: 30_000_00,
    },
  ],
  enquiries: {
    open: 11,
    newThisMonth: 6,
    admittedThisMonth: 2,
    followUpsDue: [
      {
        id: id(30),
        childName: "Diya",
        parentName: "Kavitha",
        parentPhone: "98400 99999",
        nextFollowUpOn: "2026-11-24",
      },
    ],
  },
  lowStock: [
    {
      itemId: id(40),
      name: "Crayon box",
      unit: "box",
      onHand: 6,
      reorderLevel: 10,
    },
  ],
  upcoming: [
    { id: id(50), title: "Sports day", kind: "event", startsOn: "2026-11-28" },
    { id: id(51), title: "Christmas", kind: "holiday", startsOn: "2026-12-25" },
  ],
};

const NEW_CENTRE: PreschoolCentreDashboard = {
  ...BUSY,
  setup: {
    hasClassrooms: false,
    hasStaff: true,
    hasFeeStructure: false,
    hasChildren: false,
  },
  children: { active: 0, capacity: 0, seatsLeft: 0, classrooms: [] },
  attendanceToday: {
    present: 0,
    absent: 0,
    leave: 0,
    notMarked: 0,
    checkedOut: 0,
    stillHere: 0,
  },
  dailyReportsToday: { published: 0, draft: 0, notStarted: 0 },
  fees: {
    collectedTodayPaise: 0,
    collectedThisMonthPaise: 0,
    duePaise: 0,
    overduePaise: 0,
    childrenWithDues: 0,
  },
  topDues: [],
  enquiries: {
    open: 0,
    newThisMonth: 0,
    admittedThisMonth: 0,
    followUpsDue: [],
  },
  lowStock: [],
  upcoming: [],
};

const CALM: PreschoolCentreDashboard = {
  ...BUSY,
  topDues: [],
  lowStock: [],
  enquiries: { ...BUSY.enquiries, followUpsDue: [] },
  fees: { ...BUSY.fees, overduePaise: 0 },
};

function api(view: PreschoolCentreDashboard) {
  return mockPreschoolApi({
    routes: { "GET /dashboard": () => ({ json: view }) },
  });
}

const meta = {
  title: "Preschool/Centre Dashboard",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
  render: () => <CentreDashboardScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BusyDay: Story = {
  beforeEach: () => api(BUSY),
  play: async ({ canvas }) => {
    const tiles = within(
      await canvas.findByRole("region", { name: "Today's figures" }),
    );
    await expect(tiles.getByText("/ 55")).toBeVisible();
    await expect(tiles.getByText("18 still here")).toBeVisible();
    await expect(tiles.getByText("48,75,000")).toBeVisible();
    await expect(tiles.getByText("1,85,000")).toBeVisible();
    await expect(tiles.getByText("9 Children owe ₹3,20,000")).toBeVisible();

    const today = within(
      canvas.getByRole("list", { name: "Attendance by Classroom" }),
    );
    await expect(today.getByText("17 / 20 present")).toBeVisible();
    await expect(
      today.getByRole("link", { name: "Not marked yet" }),
    ).toHaveAttribute("href", `/preschool/attendance?classroomId=${id(3)}`);
    await expect(canvas.getByText("14 / 27")).toBeVisible();

    const overdue = within(
      canvas.getByRole("region", { name: "Overdue fees" }),
    );
    await expect(
      overdue.getByRole("link", { name: /Aadhya Kumar/ }),
    ).toHaveAttribute("href", `/preschool/fees/children/${id(20)}`);
    await expect(overdue.getByText("₹45,000")).toBeVisible();
    await expect(
      within(canvas.getByRole("region", { name: "Follow-ups due" })).getByRole(
        "link",
        { name: /Diya/ },
      ),
    ).toHaveAttribute("href", `/preschool/enquiries/${id(30)}`);
    await expect(
      within(canvas.getByRole("region", { name: "Low stock" })).getByText(
        "6 box left · reorder at 10",
      ),
    ).toBeVisible();
    await expect(canvas.getByText("Sports day")).toBeVisible();
    await expect(canvas.queryByText("Get started")).not.toBeInTheDocument();
  },
};

export const BrandNewCentre: Story = {
  beforeEach: () => api(NEW_CENTRE),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Get started" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("1 of 4 done.", { exact: false }),
    ).toBeVisible();
    await expect(canvas.getByText("(done)")).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /Add Classrooms/ }),
    ).toHaveAttribute("href", "/preschool/classrooms");
    await expect(
      canvas.queryByRole("link", { name: /Add Staff/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /Admit the first Child/ }),
    ).toHaveAttribute("href", "/preschool/children/new");
    await expect(
      canvas.queryByRole("region", { name: "Today's figures" }),
    ).not.toBeInTheDocument();
  },
};

export const NothingNeedsAttention: Story = {
  beforeEach: () => api(CALM),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nothing needs attention."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Overdue fees" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Nothing overdue")).toBeVisible();
  },
};

/** At 375 px the dashboard does not scroll sideways. */
export const Phone: Story = {
  beforeEach: () => api(BUSY),
  decorators: [withPhoneFrame],
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("region", { name: "Today's figures" });
    await expectFitsPhone(canvasElement);
  },
};
