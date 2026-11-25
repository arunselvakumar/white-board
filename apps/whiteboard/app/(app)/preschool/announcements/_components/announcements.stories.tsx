import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import {
  CURRENT_YEAR_ID,
  NURSERY_A_ID,
  NURSERY_B_ID,
  NURSERY_ID,
} from "@/app/(app)/preschool/_components/preschool-story-fixtures";
import type { PreschoolAnnouncement } from "@/src/queries/preschool/announcements";

import { AnnouncementsScreen } from "./announcements-screen";

const NOW = "2026-11-25T05:00:00.000Z";

function announcement(
  overrides: Partial<PreschoolAnnouncement> = {},
): PreschoolAnnouncement {
  return {
    id: "aa0e8400-e29b-41d4-a716-446655440001",
    centreId: null,
    classroomId: null,
    audience: "All Centres",
    kind: "holiday",
    title: "Christmas break",
    body: "The preschool is closed.\nSee you on 28 December.",
    startsOn: "2026-12-24",
    endsOn: "2026-12-27",
    publishedAt: NOW,
    createdByUserId: "user_owner",
    createdByName: "Arun",
    updatedAt: NOW,
    canEdit: false,
    ...overrides,
  };
}

const SPORTS_DAY = announcement({
  id: "aa0e8400-e29b-41d4-a716-446655440002",
  centreId: CENTRE_IDS.annaNagar,
  classroomId: NURSERY_A_ID,
  audience: "Nursery A",
  kind: "event",
  title: "Sports Day",
  body: "Wear white.",
  startsOn: "2026-12-05",
  endsOn: "2026-12-05",
  createdByName: "Kavya",
  canEdit: true,
});

function room(id: string, name: string) {
  return {
    id,
    centreId: CENTRE_IDS.annaNagar,
    academicYearId: CURRENT_YEAR_ID,
    programmeId: NURSERY_ID,
    programmeName: "Nursery (Pre-KG)",
    name,
    capacity: 20,
    childCount: 18,
    seatsLeft: 2,
    isArchived: false,
    teachers: [],
  };
}

const CLASSROOMS = {
  academicYear: { id: CURRENT_YEAR_ID, name: "2026–27" },
  items: [room(NURSERY_A_ID, "Nursery A"), room(NURSERY_B_ID, "Nursery B")],
};

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Announcements",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/announcements" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /announcements": () => ({
          json: { items: [], nextCursor: null, total: 0 },
        }),
        "GET /announcements/upcoming": () => ({ json: { items: [] } }),
        "GET /classrooms": () => ({ json: CLASSROOMS }),
      },
    });
  },
  render: () => <AnnouncementsScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Announcements yet")).toBeVisible();
    await expect(canvas.queryByText("Coming up")).not.toBeInTheDocument();
  },
};

export const Feed: Story = {
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /announcements": () => ({
          json: {
            items: [SPORTS_DAY, announcement()],
            nextCursor: null,
            total: 2,
          },
        }),
        "GET /announcements/upcoming": () => ({
          json: { items: [SPORTS_DAY, announcement()] },
        }),
        "GET /classrooms": () => ({ json: CLASSROOMS }),
      },
    });
  },
  render: () => <AnnouncementsScreen />,
  play: async ({ canvas }) => {
    const comingUp = within(
      await canvas.findByRole("region", { name: "Coming up" }),
    );
    await expect(comingUp.getByText("Sports Day")).toBeVisible();
    await expect(
      await canvas.findByText("24 Dec 2026 – 27 Dec 2026"),
    ).toBeVisible();
    await expect(canvas.getByText("For All Centres")).toBeVisible();
    await expect(
      canvas.getByText(/The preschool is closed\.\s+See you on 28 December\./),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Actions for Sports Day" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Actions for Christmas break" }),
    ).not.toBeInTheDocument();
  },
};

/** A Teacher posts only to their own Classroom, a notice or an event. */
export const TeacherPosts: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      memberRole: "teacher",
      me: preschoolMe({
        role: "teacher",
        centres: preschoolMe().centres.slice(0, 1),
        hasSeveralCentres: false,
        classroomIds: [NURSERY_A_ID],
      }),
      routes: {
        "GET /announcements": () => ({
          json: { items: [], nextCursor: null, total: 0 },
        }),
        "GET /announcements/upcoming": () => ({ json: { items: [] } }),
        "GET /classrooms": () => ({ json: CLASSROOMS }),
        "POST /announcements": () => ({ status: 201, json: SPORTS_DAY }),
      },
    });
  },
  render: () => <AnnouncementsScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      (await canvas.findAllByRole("button", { name: "New Announcement" }))[0] ??
        canvasElement,
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByLabelText("For"));
    const options = await body.findAllByRole("option");
    await expect(options.map((option) => option.textContent)).toEqual([
      "Nursery A",
    ]);
    await userEvent.click(options[0] ?? canvasElement);
    await userEvent.click(dialog.getByLabelText("Kind"));
    const kinds = await body.findAllByRole("option");
    await expect(kinds.map((option) => option.textContent)).toEqual([
      "Notice",
      "Event",
    ]);
    await userEvent.click(await body.findByRole("option", { name: "Event" }));
    await userEvent.type(dialog.getByLabelText("Title"), "Sports Day");
    await userEvent.type(dialog.getByLabelText("Message"), "Wear white.");
    await userEvent.click(dialog.getByRole("button", { name: "Post" }));
    await expect(await dialog.findByText("Enter the first day")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("First day"), "2026-12-05");
    await expect(
      dialog.getByText(
        "The Parents of the Children it reaches are emailed when you post.",
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.route === "POST /announcements")?.body,
      ).toEqual({
        kind: "event",
        title: "Sports Day",
        body: "Wear white.",
        startsOn: "2026-12-05",
        endsOn: null,
        centreId: CENTRE_IDS.annaNagar,
        classroomId: NURSERY_A_ID,
      }),
    );
  },
};
